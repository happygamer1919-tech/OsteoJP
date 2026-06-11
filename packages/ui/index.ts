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
export { Select, type SelectProps } from "./src/components/Select";
export { Checkbox, type CheckboxProps } from "./src/components/Checkbox";
export { Switch, type SwitchProps } from "./src/components/Switch";
export { Card, type CardProps } from "./src/components/Card";
export { KpiCard, type KpiCardProps } from "./src/components/KpiCard";
export {
  StatusChip,
  type StatusChipProps,
  type StatusTone,
} from "./src/components/StatusChip";
export { Dialog, type DialogProps } from "./src/components/Dialog";
export {
  Drawer,
  type DrawerProps,
  type DrawerDiscardCopy,
} from "./src/components/Drawer";
export { Tabs, type TabsProps, type TabItem } from "./src/components/Tabs";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentItem,
} from "./src/components/SegmentedControl";
export {
  Table,
  TableCardRow,
  type TableProps,
  type TableColumn,
  type TableState,
  type TableSort,
  type TableCardRowProps,
  type TableCardRowItem,
} from "./src/components/Table";
export {
  Skeleton,
  SkeletonText,
  SkeletonTable,
  type SkeletonProps,
  type SkeletonVariant,
  type SkeletonTextProps,
  type SkeletonTableProps,
} from "./src/components/Skeleton";
export { EmptyState, type EmptyStateProps } from "./src/components/EmptyState";
export { ErrorState, type ErrorStateProps } from "./src/components/ErrorState";
