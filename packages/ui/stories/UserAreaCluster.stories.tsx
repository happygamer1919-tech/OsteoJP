import type { Meta, StoryObj } from "@storybook/react-vite";

import { UserAreaCluster } from "../src/components/UserAreaCluster";

/**
 * UserAreaCluster (SPEC-v2-foundation §7.3): signed-in-staff identity strip
 * shown at the top-right of the content area. Avatar + name / role label.
 * Presentational only — renders session data passed from the server shell; no
 * interactivity.
 *
 * THE BELL LEFT THIS COMPONENT in W13-02 and is now `NotificationBell`, with its
 * own story. It was decorative here, and its only consumer wrapped this cluster
 * in a profile link, so clicking it navigated to the profile — the defect PG4
 * fixed. The `NoBell` story went with it: there is no bell left to switch off.
 */
const meta = {
  title: "Components/UserAreaCluster",
  component: UserAreaCluster,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    name: "Ana Morais",
    roleLabel: "Administradora",
    initials: "AM",
  },
} satisfies Meta<typeof UserAreaCluster>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: avatar + name + role label (admin). */
export const Default: Story = {};

/** Terapeuta role. */
export const Terapeuta: Story = {
  args: {
    name: "João Santos",
    roleLabel: "Terapeuta",
    initials: "JS",
  },
};

/** Rececionista role. */
export const Rececionista: Story = {
  args: {
    name: "Carla Nunes",
    roleLabel: "Rececionista",
    initials: "CN",
  },
};

/** Long name — tests truncation at min-width. */
export const LongName: Story = {
  args: {
    name: "Maria Fernanda de Albuquerque",
    roleLabel: "Administradora",
    initials: "MA",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 200 }}>
        <Story />
      </div>
    ),
  ],
};

/** All roles side-by-side — visual reference for the four role types. */
export const AllRoles: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <UserAreaCluster name="Ana Morais" roleLabel="Proprietário" initials="AM" />
      <UserAreaCluster name="Rui Costa" roleLabel="Administrador" initials="RC" />
      <UserAreaCluster name="João Santos" roleLabel="Terapeuta" initials="JS" />
      <UserAreaCluster name="Carla Nunes" roleLabel="Rececionista" initials="CN" />
    </div>
  ),
};
