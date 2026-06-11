// @osteojp/ui — Shared React components + brand tokens (Tailwind). Storybook scaffold = Max, Phase 2.
export const PACKAGE_NAME = "@osteojp/ui" as const;

export {
  BrandLockup,
  type BrandLockupProps,
  type BrandLockupVariant,
  type BrandLockupSize,
} from "./src/brand/BrandLockup";

export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./src/components/Button";

export { Field, type FieldProps } from "./src/components/Field";
export { Input, type InputProps } from "./src/components/Input";
export { Textarea, type TextareaProps } from "./src/components/Textarea";
