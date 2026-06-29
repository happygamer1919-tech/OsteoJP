// All paths use viewBox="0 0 56 80" (matches w-56 h-80 aspect ratio exactly).
// Anterior and posterior use the same silhouette paths — the view label is
// sufficient to communicate front vs. back in a simplified clinical diagram.

export type FigSex = "male" | "female";

interface FigureProps {
  sex: FigSex;
  className?: string;
}

// Shared neck rect for anterior/posterior views.
const NECK = "M26,13.5 L30,13.5 L30,18 L26,18 Z";

// Anterior/posterior male: broader shoulders (x 11–45), arms, moderate hips.
const APM_BODY =
  "M26,18 L11,21 L8,42 L11,43 L15,25 L20,55 L24,60 L32,60 L36,55 L41,25 L45,43 L48,42 L45,21 L30,18 Z";
const APM_LEFT_LEG = "M20,55 L18,79 L24,79 L24,60 Z";
const APM_RIGHT_LEG = "M32,60 L32,79 L38,79 L36,55 Z";

// Anterior/posterior female: narrower shoulders (x 14–42), bust curve,
// narrower waist (x 21–35), wider hips (x 17–39).
const APF_BODY =
  "M26,18 L14,21 L11,42 L14,43 Q13,34 17,25 Q16,31 21,46 L17,55 L22,60 L34,60 L39,55 L35,46 Q40,31 39,25 Q43,34 42,43 L45,42 L48,42 L45,21 L30,18 Z";
const APF_LEFT_LEG = "M17,55 L15,79 L22,79 L22,60 Z";
const APF_RIGHT_LEG = "M34,60 L34,79 L41,79 L39,55 Z";

// Lateral left (patient faces right): head cx=31.
const LLM_BODY =
  "M27,13.5 L35,13.5 C37,20 38,27 36,36 C34,43 32,50 31,57 L30,79 L37,79 L27,79 C25,70 23,62 23,56 C22,49 24,42 25,37 C25,29 24,22 27,13.5 Z";

// Lateral left female: more prominent bust + slightly wider hips.
const LLF_BODY =
  "M27,13.5 L35,13.5 C38,20 40,27 37,36 C35,42 32,48 31,57 L30,79 L37,79 L27,79 C24,70 22,62 22,56 C21,49 23,42 25,37 C25,29 24,22 27,13.5 Z";

// Lateral right (mirror of lateral left around x=28): head cx=25.
const LRM_BODY =
  "M29,13.5 L21,13.5 C19,20 18,27 20,36 C22,43 24,50 25,57 L26,79 L19,79 L29,79 C31,70 33,62 33,56 C34,49 32,42 31,37 C31,29 32,22 29,13.5 Z";

const LRF_BODY =
  "M29,13.5 L21,13.5 C18,20 16,27 19,36 C21,42 24,48 25,57 L26,79 L19,79 L29,79 C32,70 34,62 34,56 C35,49 33,42 31,37 C31,29 32,22 29,13.5 Z";

export function AnteriorFigure({ sex, className }: FigureProps) {
  return (
    <svg
      viewBox="0 0 56 80"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <circle cx="28" cy="7.5" r="6" />
      <path d={NECK} />
      <path d={sex === "female" ? APF_BODY : APM_BODY} />
      {sex === "female" ? (
        <>
          <path d={APF_LEFT_LEG} />
          <path d={APF_RIGHT_LEG} />
        </>
      ) : (
        <>
          <path d={APM_LEFT_LEG} />
          <path d={APM_RIGHT_LEG} />
        </>
      )}
    </svg>
  );
}

export function PosteriorFigure({ sex, className }: FigureProps) {
  // Same silhouette as anterior — view tab label distinguishes front/back.
  return <AnteriorFigure sex={sex} className={className} />;
}

export function LateralLeftFigure({ sex, className }: FigureProps) {
  return (
    <svg
      viewBox="0 0 56 80"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <circle cx="31" cy="7.5" r="6" />
      <path d={sex === "female" ? LLF_BODY : LLM_BODY} />
    </svg>
  );
}

export function LateralRightFigure({ sex, className }: FigureProps) {
  return (
    <svg
      viewBox="0 0 56 80"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <circle cx="25" cy="7.5" r="6" />
      <path d={sex === "female" ? LRF_BODY : LRM_BODY} />
    </svg>
  );
}
