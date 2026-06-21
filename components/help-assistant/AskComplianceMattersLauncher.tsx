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
  "What is my role responsible for?",
  "How do I run my first job?",
  "What are Online Invoice Payments?",
];

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
      return "No support case was created. Contact support if this is blocking your work.";
    }
    if (feedback === "not_helpful") {
      return "Feedback is local to this session. This is the kind of question we should improve.";
    }
    return "Feedback noted locally for this session only.";
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {isOpen ? (
        <div className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Ask Compliance Matters</div>
                <div className="mt-0.5 text-xs text-slate-300">Local guidance only</div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-[min(38rem,calc(100vh-7rem))] overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("ask")}
                className={mode === "ask" ? "rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" : "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"}
              >
                Ask a question
              </button>
              <button
                type="button"
                onClick={() => setMode("setup")}
                className={mode === "setup" ? "rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" : "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"}
              >
                Setup coach
              </button>
            </div>

            {mode === "ask" ? (
              <div className="mt-4 space-y-4">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    ask(question);
                  }}
                  className="space-y-2"
                >
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="ask-cm-question">
                    Question
                  </label>
                  <textarea
                    id="ask-cm-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                    placeholder="Ask about setup, training, roles, or first-job flow."
                  />
                  <button type="submit" className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    Ask
                  </button>
                </form>

                <div className="flex flex-wrap gap-2">
                  {quickQuestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => ask(item)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {item}
                    </button>
                  ))}
                </div>

                {answer ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-950">{answer.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{answer.body}</p>
                    {helpGapEvent?.eventType === "unknown_answer" ? (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
                        This is the kind of question we should improve. Contact support if this is blocking your work.
                      </p>
                    ) : null}
                    {answer.links.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {answer.links.map((link) => (
                          <Link key={`${link.label}:${link.href}`} href={link.href} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                      {[
                        ["helpful", "Helpful"],
                        ["not_helpful", "Not helpful"],
                        ["still_need_help", "Still need help"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handleFeedback(value as FeedbackState)}
                          className={feedback === value ? "rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white" : "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {feedback ? (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {feedbackMessage()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-950">{setupCoach.title}</div>
                <p className="mt-1 text-sm leading-6 text-slate-700">{setupCoach.body}</p>
                <div className="mt-3 space-y-2">
                  {setupCoach.items.map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-3">
                      <Link href={item.href} className="text-sm font-semibold text-slate-950 hover:underline">
                        {item.label}
                      </Link>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">{setupCoach.disclaimer}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.65)] hover:bg-slate-800"
      >
        Ask CM
      </button>
    </div>
  );
}
