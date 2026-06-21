"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildHelpAssistantSafeContext,
  type HelpAssistantSafeContext,
} from "@/lib/help-assistant/help-assistant-context";
import {
  answerAskComplianceMatters,
  getSetupCoachAnswer,
  type HelpAssistantAnswer,
} from "@/lib/help-assistant/help-assistant-answer";
import {
  createFeedbackHelpGapEvent,
  createUnknownAnswerHelpGapEvent,
  type HelpGapEvent,
} from "@/lib/help-assistant/help-gap-events";

type AssistantMode = "ask" | "setup";
type FeedbackState = "helpful" | "not_helpful" | "still_need_help" | null;

type AskComplianceMattersLauncherProps = {
  context: HelpAssistantSafeContext;
};

const quickQuestions = [
  "What should I do first?",
  "How do I run my first job?",
  "What is Launch Room?",
  "What is Training Room?",
  "What are Online Invoice Payments?",
  "What is my role responsible for?",
];

const modeButtonClass =
  "min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition-colors";
const inactiveModeButtonClass =
  "border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950";
const activeModeButtonClass =
  "bg-white text-slate-950 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)]";

function splitAnswerBody(value: string) {
  return value
    .split(/(?<=\.)\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AskComplianceMattersLauncher({ context }: AskComplianceMattersLauncherProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("ask");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<HelpAssistantAnswer | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [helpGapEvent, setHelpGapEvent] = useState<HelpGapEvent | null>(null);
  const safeContext = useMemo(
    () => buildHelpAssistantSafeContext({ ...context, pathname: pathname ?? context.pathname }),
    [context, pathname],
  );
  const setupCoach = getSetupCoachAnswer();

  function ask(nextQuestion: string) {
    const nextAnswer = answerAskComplianceMatters(nextQuestion, safeContext);
    setQuestion(nextQuestion);
    setAnswer(nextAnswer);
    setFeedback(null);
    setHelpGapEvent(
      nextAnswer.status === "fallback"
        ? createUnknownAnswerHelpGapEvent({
            context: safeContext,
            questionText: nextQuestion,
            answer: nextAnswer,
          })
        : null,
    );
    setMode("ask");
  }

  function handleFeedback(nextFeedback: FeedbackState) {
    setFeedback(nextFeedback);
    if (!nextFeedback || nextFeedback === "helpful") {
      setHelpGapEvent(null);
      return;
    }

    setHelpGapEvent(
      createFeedbackHelpGapEvent({
        eventType: nextFeedback,
        context: safeContext,
        questionText: question,
        answer,
        assistantMode: mode === "setup" ? "setup_coach" : "help_chat",
      }),
    );
  }

  function feedbackMessage() {
    if (!feedback) return null;
    if (feedback === "still_need_help") {
      return "Marked locally for this session. No support case was created. Contact support if this is blocking your work.";
    }
    if (feedback === "not_helpful") {
      return "Marked locally for this session. This is the kind of question we should improve.";
    }
    return "Marked locally for this session.";
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:max-w-[calc(100vw-2rem)]">
      {isOpen ? (
        <div className="w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_70px_-34px_rgba(15,23,42,0.5)] sm:w-[min(27rem,calc(100vw-2rem))]">
          <div className="border-b border-slate-200 bg-slate-950 px-4 py-3.5 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-5">Ask Compliance Matters</div>
                <div className="mt-1 max-w-xs text-xs leading-5 text-slate-300">
                  Guidance only. I do not change settings or create records.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded-md border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-[min(40rem,calc(100vh-6.5rem))] overflow-y-auto bg-slate-50/70 p-3.5 sm:p-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode("ask")}
                className={`${modeButtonClass} ${mode === "ask" ? activeModeButtonClass : inactiveModeButtonClass}`}
              >
                Ask
              </button>
              <button
                type="button"
                onClick={() => setMode("setup")}
                className={`${modeButtonClass} ${mode === "setup" ? activeModeButtonClass : inactiveModeButtonClass}`}
              >
                Setup Coach
              </button>
            </div>

            {mode === "ask" ? (
              <div className="mt-4 space-y-3.5">
                {!answer ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                    <div className="text-sm font-semibold text-slate-950">Ask about the startup path</div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Ask about setup, training, roles, online payments, or first-job workflow.
                    </p>
                  </div>
                ) : null}

                <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Starter prompts
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickQuestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => ask(item)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold leading-5 text-slate-700 hover:bg-slate-50"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    ask(question);
                  }}
                  className="rounded-lg border border-slate-200 bg-white p-3.5"
                >
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="ask-cm-question">
                    Question
                  </label>
                  <textarea
                    id="ask-cm-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-slate-500"
                    placeholder="Ask about setup, training, roles, or first-job flow."
                  />
                  <button type="submit" className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                    Ask
                  </button>
                </form>

                {answer ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Answer
                        </div>
                        <div className="mt-1 text-base font-semibold leading-6 text-slate-950">{answer.title}</div>
                      </div>
                      {answer.status === "fallback" ? (
                        <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">
                          Needs review
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                      {splitAnswerBody(answer.body).map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                    {helpGapEvent?.eventType === "unknown_answer" ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                        <div className="font-semibold">I don't know that yet.</div>
                        <p className="mt-1">This is the kind of question we should improve. Contact support if this is blocking your work.</p>
                      </div>
                    ) : null}
                    {answer.links.length > 0 ? (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Open related area
                        </div>
                        <div className="flex flex-wrap gap-2">
                        {answer.links.map((link) => (
                          <Link key={`${link.label}:${link.href}`} href={link.href} className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold leading-5 text-slate-700 hover:bg-slate-100">
                            {link.label}
                          </Link>
                        ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Was this useful?
                      </div>
                      <div className="flex flex-wrap gap-2">
                      {[
                        ["helpful", "Helpful"],
                        ["not_helpful", "Not helpful"],
                        ["still_need_help", "Still need help"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handleFeedback(value as FeedbackState)}
                          className={feedback === value ? "rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold leading-5 text-white" : "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold leading-5 text-slate-700 hover:bg-slate-100"}
                        >
                          {label}
                        </button>
                      ))}
                      </div>
                    </div>
                    {feedback ? (
                      <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-500">
                        {feedbackMessage()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3.5">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Startup path</div>
                <div className="mt-1 text-base font-semibold leading-6 text-slate-950">{setupCoach.title}</div>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Follow the startup path without taking on everything at once.
                </p>
                <div className="mt-3 space-y-2">
                  {setupCoach.items.map((item, index) => (
                    <div key={item.label} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                        {index + 1}
                      </div>
                      <div>
                        <Link href={item.href} className="text-sm font-semibold leading-5 text-slate-950 hover:underline">
                          {item.label}
                        </Link>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-500">{setupCoach.disclaimer}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="rounded-full border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.65)] hover:bg-slate-800"
      >
        Ask CM
      </button>
    </div>
  );
}
