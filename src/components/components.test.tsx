import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { layoutTimetable } from "@/lib/domain/timetable";
import { formatDateRange } from "./festival-card";
import { FriendBadges } from "./friend-badges";
import { describePerformance } from "./performance-summary";
import { PriorityPicker } from "./priority-picker";
import { TimetableGrid } from "./timetable-grid";

vi.mock("@/app/actions/picks", () => ({ setPickAction: vi.fn(async () => ({})) }));

const pickerProps = { artistName: "Wet Leg", artistId: "a1", festivalId: "f1", slug: "fest" };

describe("PriorityPicker", () => {
  it("offers five labelled levels and marks the current one", () => {
    render(<PriorityPicker {...pickerProps} priority={4} action={vi.fn(async () => ({}))} />);
    const group = screen.getByRole("radiogroup", { name: "How much do you want to see Wet Leg?" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Maybe", "Would like", "Want to see", "Really want", "Must see"]);
    expect(within(group).getByRole("radio", { name: "Really want" })).toHaveAttribute("aria-checked", "true");
  });

  it("submits the chosen priority", async () => {
    const action = vi.fn(async () => ({}));
    render(<PriorityPicker {...pickerProps} priority={null} action={action} />);
    await userEvent.click(screen.getByRole("radio", { name: "Must see" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const form = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(form)).toEqual({ slug: "fest", festivalId: "f1", artistId: "a1", priority: "5" });
  });

  it("clears the pick when the current level is clicked again", async () => {
    const action = vi.fn(async () => ({}));
    render(<PriorityPicker {...pickerProps} priority={3} action={action} />);
    await userEvent.click(screen.getByRole("radio", { name: "Want to see" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0] as unknown as [unknown, FormData])[1].get("priority")).toBe("");
  });

  it("shows server errors", async () => {
    const action = vi.fn(async () => ({ error: "Mark yourself as going before picking artists." }));
    render(<PriorityPicker {...pickerProps} priority={null} action={action} />);
    await userEvent.click(screen.getByRole("radio", { name: "Maybe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mark yourself as going");
  });
});

describe("FriendBadges", () => {
  const friends = [
    { userId: "1", username: "alice", priority: 5 as const },
    { userId: "2", username: "bob", priority: 2 as const },
    { userId: "3", username: "cara", priority: 1 as const },
  ];

  it("labels friends with their priorities", () => {
    render(<FriendBadges friends={friends} />);
    expect(screen.getByLabelText("Friends: alice (Must see), bob (Would like), cara (Maybe)")).toBeInTheDocument();
  });

  it("collapses extras into a count", () => {
    render(<FriendBadges friends={friends} max={2} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("renders nothing without friends", () => {
    const { container } = render(<FriendBadges friends={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TimetableGrid", () => {
  const T = (iso: string) => new Date(iso);
  const performances = [
    { id: "p1", artistId: "a1", artistName: "Headliner", stageId: "s1", stageName: "Main", startsAt: T("2027-07-02T20:00:00Z"), endsAt: T("2027-07-02T21:30:00Z") },
    { id: "p2", artistId: "a2", artistName: "Clasher", stageId: "s2", stageName: "Tent", startsAt: T("2027-07-02T20:30:00Z"), endsAt: T("2027-07-02T21:30:00Z") },
  ];
  const layout = layoutTimetable(performances, [
    { id: "s1", name: "Main", sortOrder: 0 },
    { id: "s2", name: "Tent", sortOrder: 1 },
  ])!;

  it("renders stages, local hour labels and accessible set descriptions", () => {
    render(
      <TimetableGrid
        layout={layout}
        timeZone="Europe/London"
        myPicks={new Map([["a1", 5]])}
        friendPicks={new Map([["a2", [{ userId: "u", username: "bob", priority: 3 }]]])}
      />,
    );
    const grid = screen.getByRole("region", { name: "Timetable" });
    expect(within(grid).getByRole("region", { name: "Main" })).toBeInTheDocument();
    expect(within(grid).getByText("21:00")).toBeInTheDocument();
    expect(within(grid).getByText("23:00")).toBeInTheDocument();
    expect(within(grid).getByRole("article", { name: "Headliner, 21:00–22:30, your pick: Must see" })).toBeInTheDocument();
    expect(within(grid).getByRole("article", { name: "Clasher, 21:30–22:30, 1 friend want to go" })).toBeInTheDocument();
  });

  it("marks plan status", () => {
    render(
      <TimetableGrid
        layout={layout}
        timeZone="Europe/London"
        myPicks={new Map()}
        friendPicks={new Map()}
        planStatus={new Map([["p1", "chosen"], ["p2", "skipped"]])}
      />,
    );
    expect(screen.getByRole("article", { name: /Headliner.*in your plan/ })).toHaveAttribute("data-plan", "chosen");
    expect(screen.getByRole("article", { name: /Clasher.*clashes with your plan/ })).toHaveAttribute("data-plan", "skipped");
  });
});

describe("formatting helpers", () => {
  it.each([
    [null, null, null],
    ["2027-06-24", null, "24 Jun 2027"],
    ["2027-06-24", "2027-06-24", "24 Jun 2027"],
    ["2027-06-24", "2027-06-28", "24 – 28 Jun 2027"],
    ["2027-06-30", "2027-07-02", "30 Jun – 2 Jul 2027"],
  ])("formatDateRange(%s, %s) = %s", (start, end, expected) => {
    expect(formatDateRange(start, end)).toBe(expected);
  });

  it("describes performances in festival time", () => {
    const p = { startsAt: new Date("2027-07-03T00:30:00Z"), endsAt: new Date("2027-07-03T02:00:00Z"), stageName: "Tent" };
    expect(describePerformance(p, "Europe/London", 6)).toBe("Fri 2 Jul 01:30–03:00 · Tent");
    expect(describePerformance({ startsAt: null, endsAt: null, stageName: null }, "Europe/London", 6)).toBe("Time TBA");
  });
});
