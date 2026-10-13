"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import type { Locale } from "@osteojp/i18n";
import {
  EMPTY_SURVEY_FORM_STATE,
  SURVEY_COMMENT_MAX,
  SURVEY_NPS_VALUES,
  SURVEY_RATING_VALUES,
} from "@/lib/surveys/survey-form";
import { submitSurveyAction } from "./actions";

// The survey form: two required scales, an optional comment, one unticked box
// and one button. No opt-out control here: that is a later pull request.
//
// IT WORKS WITHOUT SCRIPT. The form posts to the server action either way.
//
// WHAT THE VISITOR ENTERED NEVER LEAVES THEIR FORM UNTIL IT IS AN ANSWER. With
// script, the submit is sent from `onSubmit` and the fields are left exactly as
// they are, so a submit refused for a missing answer loses nothing and no value
// has to come back from the server to be shown again. (A form whose `action`
// React runs itself is reset when the action returns.) The state the action
// returns says which sentences to show and holds no answer.
//
// `noValidate`, ON PURPOSE: the sentences beside the fields are the approved
// copy (texts 21 to 25), in the page's language. The browser's own validation
// bubbles are neither.

/** The strings the form shows, resolved by the page in the clinic's language. */
export type SurveyFormLabels = {
  instruction: string;
  whoReads: string;
  q1: string;
  q1Low: string;
  q1High: string;
  q2: string;
  q2Low: string;
  q2High: string;
  q3: string;
  q3Hint: string;
  healthNote: string;
  contactConsent: string;
  submit: string;
  errorSummary: string;
  q1Error: string;
  q2Error: string;
  commentError: string;
  saveError: string;
};

function Scale({
  name,
  legend,
  values,
  low,
  high,
  error,
  columns,
}: {
  name: string;
  legend: string;
  values: readonly number[];
  low: string;
  high: string;
  error: string | null;
  columns: string;
}) {
  const legendId = `${name}-legend`;
  const errorId = `${name}-error`;
  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      aria-required="true"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="space-y-2"
    >
      <legend id={legendId} className="text-body-sm font-medium text-text-primary">
        {legend}
      </legend>
      {error ? (
        <p id={errorId} className="text-body-sm font-medium text-error">
          {error}
        </p>
      ) : null}
      <div className={`grid gap-2 ${columns}`}>
        {values.map((value) => (
          <label
            key={value}
            className="relative flex h-11 items-center justify-center rounded border border-border bg-bg text-body-sm font-medium text-text-primary has-[:checked]:border-brand-teal has-[:checked]:bg-brand-teal has-[:checked]:text-text-inverse has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring has-[:focus-visible]:ring-offset-2"
          >
            {/* The input covers its label, so the whole cell is the control. */}
            <input
              type="radio"
              name={name}
              value={value}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {value}
          </label>
        ))}
      </div>
      <div className="flex justify-between gap-4 text-body-sm text-text-secondary">
        <span>{low}</span>
        <span className="text-right">{high}</span>
      </div>
    </fieldset>
  );
}

export function SurveyForm({
  code,
  locale,
  consentVersion,
  labels,
}: {
  code: string;
  locale: Locale;
  consentVersion: string;
  labels: SurveyFormLabels;
}) {
  const [state, action, pending] = useActionState(submitSurveyAction, EMPTY_SURVEY_FORM_STATE);
  const { errors } = state;
  const fieldError = Boolean(errors.nps || errors.rating || errors.comment);
  const summary = errors.save ? labels.saveError : fieldError ? labels.errorSummary : null;

  // The summary sits above the questions and the button below them. On a phone
  // a refused submit would otherwise change nothing the visitor can see.
  const summaryRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (summary) summaryRef.current?.focus();
  }, [state, summary]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form action={action} onSubmit={submit} noValidate className="space-y-6">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="consentVersion" value={consentVersion} />

      <div className="space-y-2 text-body-sm text-text-secondary">
        <p>{labels.instruction}</p>
        <p>{labels.whoReads}</p>
      </div>

      {summary ? (
        <p
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded border border-error bg-bg p-3 text-body-sm font-medium text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {summary}
        </p>
      ) : null}

      <Scale
        name="nps"
        legend={labels.q1}
        values={SURVEY_NPS_VALUES}
        low={labels.q1Low}
        high={labels.q1High}
        error={errors.nps ? labels.q1Error : null}
        columns="grid-cols-6"
      />

      <Scale
        name="rating"
        legend={labels.q2}
        values={SURVEY_RATING_VALUES}
        low={labels.q2Low}
        high={labels.q2High}
        error={errors.rating ? labels.q2Error : null}
        columns="grid-cols-5"
      />

      <div className="space-y-2">
        <label htmlFor="survey-comment" className="block text-body-sm font-medium text-text-primary">
          {labels.q3}
        </label>
        {errors.comment ? (
          <p id="survey-comment-error" className="text-body-sm font-medium text-error">
            {labels.commentError}
          </p>
        ) : null}
        <textarea
          id="survey-comment"
          name="comment"
          rows={4}
          maxLength={SURVEY_COMMENT_MAX}
          aria-invalid={errors.comment ? true : undefined}
          aria-describedby={
            errors.comment ? "survey-comment-error survey-comment-hint" : "survey-comment-hint"
          }
          className="block w-full rounded border border-border bg-bg p-3 text-body-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        />
        <div id="survey-comment-hint" className="space-y-1 text-body-sm text-text-secondary">
          <p>{labels.q3Hint}</p>
          <p>{labels.healthNote}</p>
        </div>
      </div>

      <label className="flex items-start gap-3 text-body-sm text-text-primary">
        <input
          type="checkbox"
          name="contactConsent"
          className="mt-0.5 size-5 shrink-0 accent-brand-teal"
        />
        <span>{labels.contactConsent}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="w-full rounded bg-brand-teal px-4 py-3 font-medium text-text-inverse hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
