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
export {
  ToastProvider,
  useToast,
  type ToastProviderProps,
  type ToastOptions,
  type ToastTone,
  type ToastAction,
} from "./src/components/Toast";
export { Banner, type BannerProps, type BannerTone } from "./src/components/Banner";
export {
  HeritageDivider,
  type HeritageDividerProps,
  type HeritageDividerVariant,
} from "./src/components/HeritageDivider";
export {
  HeritageCorners,
  type HeritageCornersProps,
  type HeritageCornersVariant,
  type HeritageCornersTone,
} from "./src/components/HeritageCorners";
export { HeritageBand, type HeritageBandProps } from "./src/components/HeritageBand";
export {
  StaffAppShell,
  PortalShell,
  type StaffAppShellProps,
  type PortalShellProps,
  type AppShellNavItem,
} from "./src/components/AppShell";

// W2-01 composite components (shared Wave 2 / Wave 3 hard gate).
export {
  Combobox,
  type ComboboxProps,
  type ComboboxOption,
} from "./src/components/Combobox";
export { DatePicker, type DatePickerProps } from "./src/components/DatePicker";
export { TimeField, type TimeFieldProps } from "./src/components/TimeField";
export {
  SlotPicker,
  type SlotPickerProps,
  type SlotOption,
} from "./src/components/SlotPicker";

// OsteoJP v2 design system (SPEC-v2-foundation). Glass primitives ship in V2-W0
// and are consumed by the V2 section waves.
export { type V2Accent } from "./src/components/v2-accent";
export { GlassCard, type GlassCardProps } from "./src/components/GlassCard";
export {
  GlassKpiCard,
  type GlassKpiCardProps,
} from "./src/components/GlassKpiCard";
export {
  QuickActionTile,
  type QuickActionTileProps,
} from "./src/components/QuickActionTile";
export {
  GlassPanel,
  type GlassPanelProps,
} from "./src/components/GlassPanel";
export {
  GlassStatusChip,
  type GlassStatusChipProps,
  type GlassStatusTone,
} from "./src/components/GlassStatusChip";
export {
  StatusBadge,
  type StatusBadgeProps,
  type AppointmentTone,
} from "./src/components/StatusBadge";
export {
  ResumoChart,
  type ResumoChartProps,
} from "./src/components/ResumoChart";
export {
  HeritageFrame,
  isHeritageForbiddenRoute,
  type HeritageFrameProps,
  type HeritageFrameDensity,
} from "./src/components/HeritageFrame";
export {
  SidebarAppShell,
  type SidebarAppShellProps,
} from "./src/components/SidebarAppShell";
export {
  UserAreaCluster,
  type UserAreaClusterProps,
} from "./src/components/UserAreaCluster";
