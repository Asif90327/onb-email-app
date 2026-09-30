"use client";

// Next.js (App Router) + Tailwind CSS.
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Status = "scheduled" | "sent";
type Mail = {
  id: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  status: Status;
  sendAt: number;
  createdAt: number;
};
type User = { name: string; email: string };
type View = { name: "list" } | { name: "compose" } | { name: "detail"; id: string };

const KEY = "onb.v1";
const EMAIL_RE = /[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+/g;
const fmt = (t: number) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const btn = "rounded-full px-4 py-1 text-xs font-medium transition-colors";
const green = "bg-green-600 text-white hover:bg-green-700 shadow-sm";
const field =
  "w-full rounded-md bg-neutral-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500 transition-all";

/** Deliver via Next.js API route /api/send */
async function deliver(mail: Mail): Promise<void> {
  try {
    await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mail),
    });
  } catch (err) {
    console.error("Delivery error:", err);
  }
}

/** Keep only basic formatting tags from the editor's HTML. */
function clean(html: string) {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ok = new Set([
    "B",
    "I",
    "U",
    "S",
    "STRIKE",
    "STRONG",
    "EM",
    "UL",
    "OL",
    "LI",
    "BR",
    "DIV",
    "P",
    "A",
    "SPAN",
  ]);
  doc.body.querySelectorAll("*").forEach((el) => {
    if (!ok.has(el.tagName)) return el.replaceWith(...Array.from(el.childNodes));
    Array.from(el.attributes).forEach((a) => {
      if (
        !(
          el.tagName === "A" &&
          a.name === "href" &&
          /^(https?:|mailto:)/i.test(a.value)
        )
      ) {
        el.removeAttribute(a.name);
      }
    });
  });
  return doc.body.innerHTML;
}

/** One mail per recipient, spaced by `delaySec`, and at most `limit` per hour (0 = no limit). */
function buildQueue(
  from: string,
  to: string[],
  subject: string,
  html: string,
  start: number,
  delaySec: number,
  limit: number
): Mail[] {
  return to.map((r, i) => {
    const slot = limit > 0 ? Math.floor(i / limit) : 0;
    const pos = limit > 0 ? i % limit : i;
    return {
      id: crypto.randomUUID(),
      from,
      to: r,
      subject,
      html,
      status: "scheduled",
      createdAt: Date.now(),
      sendAt:
        start + pos * delaySec * 1000 + slot * 3600_000,
    };
  });
}

// Initial mock emails for demonstration
const SAMPLE_MAILS: Mail[] = [
  {
    id: "sample-1",
    from: "oliver.brown@domain.io",
    to: "testuser.one@domain.com",
    subject: "Follow up: Onboarding setup for team",
    html: "<p>Hi Team,</p><p>Following up on our recent onboarding session. Let me know if you need any additional assistance!</p>",
    status: "scheduled",
    sendAt: Date.now() + 3600_000 * 2,
    createdAt: Date.now() - 600_000,
  },
  {
    id: "sample-2",
    from: "oliver.brown@domain.io",
    to: "testuser.two@domain.com",
    subject: "Weekly Project Progress Update",
    html: "<p>Hello,</p><p>Here is the weekly update on the project milestones. Everything is progressing as scheduled.</p>",
    status: "scheduled",
    sendAt: Date.now() + 3600_000 * 5,
    createdAt: Date.now() - 300_000,
  },
  {
    id: "sample-3",
    from: "oliver.brown@domain.io",
    to: "alec.miller@acme.io",
    subject: "Q3 Strategy Meeting Confirmation",
    html: "<p>Hi Alec,</p><p>Confirming our meeting scheduled for tomorrow at 10 AM. See you then!</p>",
    status: "sent",
    sendAt: Date.now() - 86400_000,
    createdAt: Date.now() - 90000_000,
  },
  {
    id: "sample-4",
    from: "oliver.brown@domain.io",
    to: "support@service.io",
    subject: "API Dashboard Access Request",
    html: "<p>Hi Support Team,</p><p>We are requesting API access key for our dev environment. Thanks!</p>",
    status: "sent",
    sendAt: Date.now() - 43200_000,
    createdAt: Date.now() - 50000_000,
  },
];

export default function EmailApp() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [mails, setMails] = useState<Mail[]>([]);
  const [view, setView] = useState<View>({ name: "list" });
  const [folder, setFolder] = useState<Status>("scheduled");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "{}");
      setUser(s.user ?? null);
      setMails(s.mails && s.mails.length > 0 ? s.mails : SAMPLE_MAILS);
    } catch {
      setMails(SAMPLE_MAILS);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(KEY, JSON.stringify({ user, mails }));
    }
  }, [ready, user, mails]);

  // Scheduler: moves due mail to Sent and delivers it.
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const due = mails.filter((m) => m.status === "scheduled" && m.sendAt <= now);
      if (!due.length) return;
      due.forEach((m) => deliver(m).catch(() => {}));
      const ids = new Set(due.map((m) => m.id));
      setMails((ms) =>
        ms.map((m) => (ids.has(m.id) ? { ...m, status: "sent" as const } : m))
      );
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [mails]);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return mails
      .filter(
        (m) =>
          m.status === folder &&
          `${m.to} ${m.subject} ${m.html}`.toLowerCase().includes(q)
      )
      .sort((a, b) =>
        folder === "scheduled" ? a.sendAt - b.sendAt : b.sendAt - a.sendAt
      );
  }, [mails, folder, query]);

  if (!ready) return null;
  if (!user) return <Login onLogin={(u) => { setUser(u); if (!mails.length) setMails(SAMPLE_MAILS); }} />;

  if (view.name === "compose")
    return (
      <Compose
        user={user}
        onBack={() => setView({ name: "list" })}
        onQueue={(list, when) => {
          setMails((m) => [...list, ...m]);
          setFolder(when <= Date.now() + 1000 ? "sent" : "scheduled");
          setNotice(
            when <= Date.now() + 1000
              ? `Sending ${list.length} email${list.length > 1 ? "s" : ""}`
              : `Scheduled ${list.length} email${
                  list.length > 1 ? "s" : ""
                } starting ${fmt(when)}`
          );
          setView({ name: "list" });
        }}
      />
    );

  if (view.name === "detail") {
    const m = mails.find((x) => x.id === view.id);
    if (m)
      return (
        <Shell
          title={m.subject || "(no subject)"}
          onBack={() => setView({ name: "list" })}
          actions={
            <button
              onClick={() => {
                setMails(mails.filter((x) => x.id !== m.id));
                setView({ name: "list" });
                setNotice("Deleted");
              }}
              className={`${btn} border border-red-300 text-red-600 hover:bg-red-50`}
            >
              {m.status === "scheduled" ? "Cancel and delete" : "Delete"}
            </button>
          }
        >
          <article className="mx-auto max-w-3xl space-y-4 p-6 text-sm">
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4 space-y-1.5 text-xs text-neutral-600">
              <div className="flex items-center gap-2">
                <span className="w-12 font-semibold text-neutral-800">From:</span>
                <span>{m.from}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 font-semibold text-neutral-800">To:</span>
                <span className="font-medium text-neutral-900">{m.to}</span>
              </div>
              <div className="flex items-center gap-2 pt-1 text-neutral-500">
                <span className="w-12 font-semibold text-neutral-800">Status:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      m.status === "scheduled" ? "bg-amber-500 animate-pulse" : "bg-green-500"
                    }`}
                  />
                  {m.status === "scheduled"
                    ? `Scheduled for ${fmt(m.sendAt)}`
                    : `Sent ${fmt(m.sendAt)}`}
                </span>
              </div>
            </div>

            <div
              className="border-t border-neutral-100 pt-4 text-neutral-800 leading-relaxed [&_a]:text-green-700 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 space-y-3"
              dangerouslySetInnerHTML={{ __html: clean(m.html) }}
            />
          </article>
        </Shell>
      );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-800 md:flex-row">
      {/* Sidebar */}
      <aside className="w-full shrink-0 space-y-5 border-r border-neutral-100 p-5 md:w-60">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-black tracking-tight text-neutral-900">ONB</div>
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">
            PRO
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50/50 p-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-300 text-sm font-semibold text-neutral-900 shadow-sm">
            {user.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 text-xs leading-tight">
            <div className="truncate font-semibold text-neutral-900">{user.name}</div>
            <div className="truncate text-neutral-400">{user.email}</div>
          </div>
        </div>

        <button
          onClick={() => setView({ name: "compose" })}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 py-2 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Compose
        </button>

        <nav className="space-y-1 text-sm font-medium">
          {(["scheduled", "sent"] as Status[]).map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 capitalize transition-colors ${
                folder === f
                  ? "bg-green-50 text-green-700 font-semibold"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <span className="flex items-center gap-2">
                {f === "scheduled" ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {f}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  folder === f ? "bg-green-200 text-green-800" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {mails.filter((m) => m.status === f).length}
              </span>
            </button>
          ))}
        </nav>

        <div className="pt-4 border-t border-neutral-100">
          <button
            onClick={() => setUser(null)}
            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      {/* Main Mail List */}
      <main className="flex-1 p-6">
        <div className="relative max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email by recipient or content..."
            aria-label="Search mails"
            className={`${field} pl-9`}
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {notice && (
          <div
            role="status"
            className="mt-4 flex max-w-md items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-xs font-medium text-green-800 shadow-sm"
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss"
              className="text-green-600 hover:text-green-900 font-bold"
            >
              ×
            </button>
          </div>
        )}

        <ul className="mt-5 divide-y divide-neutral-100">
          {rows.length === 0 && (
            <li className="py-12 text-center text-sm text-neutral-400">
              {query
                ? "No mails match your search."
                : folder === "scheduled"
                ? "Nothing scheduled right now. Click Compose to schedule your emails!"
                : "No sent mail yet."}
            </li>
          )}
          {rows.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => setView({ name: "detail", id: m.id })}
                className="group flex w-full items-center gap-4 py-3.5 px-2 text-left text-xs transition-colors hover:bg-neutral-50/80 rounded-lg"
              >
                <span className="w-44 shrink-0 truncate font-semibold text-neutral-800">
                  To: {m.to}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 font-medium ${
                    m.status === "scheduled"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {m.status === "scheduled" ? fmt(m.sendAt) : "Sent"}
                </span>
                <span className="truncate text-neutral-600 min-w-0">
                  <span className="font-semibold text-neutral-900">
                    {m.subject || "(no subject)"}
                  </span>{" "}
                  –{" "}
                  <span className="text-neutral-400">
                    {m.html.replace(/<[^>]*>/g, " ").slice(0, 90)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email address.");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    onLogin({ name: email.split("@")[0], email });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="text-center space-y-1">
          <div className="text-2xl font-black tracking-tight text-neutral-900">ONB</div>
          <h1 className="text-lg font-semibold text-neutral-800">Login</h1>
        </div>

        <button
          onClick={() =>
            onLogin({ name: "Oliver Brown", email: "oliver.brown@domain.io" })
          }
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-100 py-2.5 text-sm font-medium text-green-800 hover:bg-green-200 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Login with Google
        </button>

        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 border-t border-neutral-200" />
          <span className="relative bg-white px-2 text-xs text-neutral-400">
            or sign in through email
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Email ID</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              aria-label="Email ID"
              className={field}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Password</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              aria-label="Password"
              className={field}
            />
          </div>
        </div>

        {err && (
          <p role="alert" className="text-xs text-red-600 font-medium">
            {err}
          </p>
        )}

        <button
          onClick={submit}
          className={`w-full rounded-lg py-2.5 text-sm font-medium ${green}`}
        >
          Login
        </button>
      </div>
    </div>
  );
}

function Shell({
  title,
  onBack,
  actions,
  children,
}: {
  title: string;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-neutral-800">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-100 bg-white/90 backdrop-blur px-6 py-3.5">
        <button
          onClick={onBack}
          className="flex items-center gap-2 truncate text-sm font-semibold hover:text-green-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="truncate">{title}</span>
        </button>
        <div className="flex items-center gap-2">{actions}</div>
      </header>
      {children}
    </div>
  );
}

function Compose({
  user,
  onBack,
  onQueue,
}: {
  user: User;
  onBack: () => void;
  onQueue: (m: Mail[], firstSendAt: number) => void;
}) {
  const [chips, setChips] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [delay, setDelay] = useState(0);
  const [limit, setLimit] = useState(0);
  const [when, setWhen] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [laterOpen, setLaterOpen] = useState(false);
  const [err, setErr] = useState("");
  const editor = useRef<HTMLDivElement>(null);

  const add = (found: string[]) =>
    setChips((c) => Array.from(new Set([...c, ...found.map((x) => x.toLowerCase())])));
  const commitDraft = () => {
    add(draft.match(EMAIL_RE) ?? []);
    setDraft("");
  };
  const exec = (cmd: string, val?: string) => {
    editor.current?.focus();
    document.execCommand(cmd, false, val);
  };

  const presets = [10, 11, 15].map((h) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  });
  const shown = expanded ? chips : chips.slice(0, 3);

  const send = () => {
    const all = Array.from(
      new Set([...chips, ...(draft.match(EMAIL_RE) ?? []).map((x) => x.toLowerCase())])
    );
    const html = clean(editor.current?.innerHTML ?? "");
    if (!all.length) return setErr("Add at least one recipient email address.");
    if (!subject.trim()) return setErr("Add a subject line.");
    if (!editor.current?.innerText.trim()) return setErr("Write a message before sending.");
    const start = when ?? Date.now();
    if (when && when < Date.now()) return setErr("Pick a send time in the future.");
    onQueue(
      buildQueue(
        user.email,
        all,
        subject.trim(),
        html,
        start,
        Math.max(0, delay),
        Math.max(0, limit)
      ),
      start
    );
  };

  const tools: [string, string, string?][] = [
    ["B", "bold"],
    ["I", "italic"],
    ["U", "underline"],
    ["S", "strikeThrough"],
    ["• List", "insertUnorderedList"],
    ["1. List", "insertOrderedList"],
    ["Link", "link"],
  ];

  return (
    <Shell
      title="Compose New Email"
      onBack={onBack}
      actions={
        <>
          <div className="relative">
            <button
              onClick={() => setLaterOpen(!laterOpen)}
              className={`${btn} border border-green-600 text-green-700 hover:bg-green-50 flex items-center gap-1.5`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {when ? fmt(when) : "Send Later"}
            </button>

            {laterOpen && (
              <div className="absolute right-0 z-20 mt-2 w-64 space-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-xs shadow-xl animate-in fade-in zoom-in-95">
                <div className="font-semibold text-neutral-800">Send Later Schedule</div>
                <div className="space-y-2 border-y border-neutral-100 py-2">
                  {presets.map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer hover:text-green-700">
                      <input
                        type="radio"
                        name="when"
                        checked={when === t}
                        onChange={() => {
                          setWhen(t);
                          setCustom("");
                        }}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span>{fmt(t)}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-neutral-500 mb-1">
                    Custom Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value);
                      setWhen(e.target.value ? new Date(e.target.value).getTime() : null);
                    }}
                    aria-label="Custom send time"
                    className={field}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => {
                      setWhen(null);
                      setCustom("");
                      setLaterOpen(false);
                    }}
                    className="px-2.5 py-1 text-neutral-500 hover:text-neutral-800"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setLaterOpen(false)}
                    className="rounded-full bg-green-600 px-3 py-1 text-white font-medium hover:bg-green-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={send} className={`${btn} ${green}`}>
            {when ? "Schedule" : "Send"}
          </button>
        </>
      }
    >
      <div className="mx-auto max-w-4xl space-y-5 p-6 text-xs">
        {err && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700 border border-red-200 font-medium">
            {err}
          </div>
        )}

        <Row label="From">
          <span className="rounded-md bg-neutral-100 px-2.5 py-1 font-mono text-neutral-700">
            {user.email}
          </span>
        </Row>

        <Row label="To">
          <div className="flex flex-wrap items-center gap-1.5">
            {shown.map((c) => (
              <button
                key={c}
                onClick={() => setChips(chips.filter((x) => x !== c))}
                title="Remove recipient"
                className="inline-flex items-center gap-1 rounded-full border border-green-600 px-2.5 py-0.5 text-green-700 hover:bg-green-50 transition-colors"
              >
                <span>{c}</span>
                <span className="font-bold">×</span>
              </button>
            ))}
            {chips.length > 3 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="rounded-full bg-green-100 px-2.5 py-0.5 text-green-800 font-semibold hover:bg-green-200 transition-colors"
              >
                {expanded ? "Show less" : `+${chips.length - 3}`}
              </button>
            )}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) =>
                ["Enter", ",", " "].includes(e.key)
                  ? (e.preventDefault(), commitDraft())
                  : e.key === "Backspace" && !draft && setChips(chips.slice(0, -1))
              }
              placeholder="recipient@example.com"
              aria-label="Recipients"
              className="min-w-48 flex-1 bg-transparent px-2 py-1 outline-none text-sm"
            />
            <label className="ml-auto cursor-pointer rounded-md bg-neutral-100 px-2.5 py-1 font-medium text-green-700 hover:bg-green-100 hover:underline transition-colors flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload List
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const text = await f.text();
                    const found = text.match(EMAIL_RE) ?? [];
                    add(found);
                    setErr(
                      found.length
                        ? ""
                        : "No valid email addresses found in the uploaded file."
                    );
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Row>

        <Row label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            className={field}
          />
        </Row>

        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-neutral-100 bg-neutral-50/50 p-3">
          <label className="flex items-center gap-2 font-medium text-neutral-700">
            Delay between 2 emails (sec):
            <input
              type="number"
              min={0}
              value={delay}
              onChange={(e) => setDelay(+e.target.value)}
              className={`${field} w-20 text-center font-bold`}
            />
          </label>
          <label className="flex items-center gap-2 font-medium text-neutral-700">
            Hourly Limit:
            <input
              type="number"
              min={0}
              value={limit}
              onChange={(e) => setLimit(+e.target.value)}
              className={`${field} w-20 text-center font-bold`}
            />
          </label>
        </div>

        {/* Rich Text Editor */}
        <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm">
          <div
            ref={editor}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Message"
            data-ph="Type your message here..."
            className="min-h-64 p-4 text-sm outline-none empty:before:text-neutral-400 empty:before:content-[attr(data-ph)] [&_a]:text-green-700 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          />
          <div className="flex flex-wrap gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 text-neutral-600">
            {tools.map(([label, cmd]) => (
              <button
                key={cmd}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  cmd === "link"
                    ? (() => {
                        const u = prompt("Link URL (https://…)");
                        if (u && /^https?:\/\//i.test(u)) exec("createLink", u);
                      })()
                    : exec(cmd)
                }
                className={`rounded px-2 py-1 text-xs hover:bg-neutral-200 hover:text-neutral-900 transition-colors ${
                  label === "B"
                    ? "font-bold"
                    : label === "I"
                    ? "italic"
                    : label === "U"
                    ? "underline"
                    : label === "S"
                    ? "line-through"
                    : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-neutral-100 pb-3.5">
      <div className="w-16 shrink-0 font-medium text-neutral-500">{label}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
