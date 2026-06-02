"use client";

import type { SanityQuizQuestion } from "@/types";
import { MultipleChoiceQuestion } from "./MultipleChoiceQuestion";
import { MatchingQuestion } from "./MatchingQuestion";
import { FreeTextQuestion } from "./FreeTextQuestion";

/** Renders the answer UI for a single question by type. The parent renders the
 * question prompt (`question_text`) above this. Shared by PracticeQuiz and the
 * inline LessonQuiz. */

const CHOICE_TYPES = new Set([
  "multiple_choice_single",
  "multiple_choice_multiple",
  "true_false",
]);

interface QuizQuestionProps {
  question: SanityQuizQuestion;
  answer: string[];
  submitted: boolean;
  onChange: (next: string[]) => void;
}

export function QuizQuestion({
  question,
  answer,
  submitted,
  onChange,
}: QuizQuestionProps) {
  if (CHOICE_TYPES.has(question.question_type)) {
    return (
      <MultipleChoiceQuestion
        question={question}
        answer={answer}
        submitted={submitted}
        onChange={onChange}
      />
    );
  }
  if (question.question_type === "matching") {
    return (
      <MatchingQuestion
        question={question}
        answer={answer}
        submitted={submitted}
        onChange={onChange}
      />
    );
  }
  return (
    <FreeTextQuestion
      question={question}
      answer={answer}
      submitted={submitted}
      onChange={onChange}
    />
  );
}
