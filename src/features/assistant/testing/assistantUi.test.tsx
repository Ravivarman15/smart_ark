import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import { AssistantPanel } from "../components/AssistantPanel";
import { AssistantLauncher } from "../components/AssistantLauncher";

// ════════════════════════════════════════════════════════════════════════════
// UI BEHAVIOUR
//
// The main suite asserts source-level properties (dvh, aria labels, no
// dangerouslySetInnerHTML) because those are structural. This file asserts the
// things only a render can prove: that asking a question actually produces an
// answer with a working documentation link, and that the panel opens and
// closes.
//
// The network is stubbed to REJECT. Refinement is optional, and the assistant
// must be fully usable when it is unavailable — which is the default state of
// this repository, and therefore the state worth testing first.
// ════════════════════════════════════════════════════════════════════════════

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn().mockRejectedValue(new Error("offline")) },
    from: vi.fn(() => {
      throw new Error("the assistant must never query a table");
    }),
  },
}));

// Analytics is fire-and-forget; stubbed so a failed insert cannot fail a test.
vi.mock("../analytics", () => ({ track: vi.fn() }));

const renderPanel = (onClose = vi.fn()) => {
  const utils = render(
    <MemoryRouter>
      <AssistantPanel onClose={onClose} />
    </MemoryRouter>,
  );
  return { ...utils, onClose };
};

const askQuestion = (text: string) => {
  const input = screen.getByLabelText(/ask a question about smart ark/i);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("The panel answers a question end to end", () => {
  it("renders an answer with a working documentation link", async () => {
    renderPanel();
    askQuestion("How do I use the Parent Portal?");

    // The answer is composed synchronously, but React state still flushes.
    await waitFor(() => {
      expect(screen.getByText(/parent portal shows your own children/i)).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /parent portal guide/i });
    // The real slug is `role-parent`. A hand-written /docs/parent-portal — the
    // obvious guess, and the one the brief's example uses — would 404.
    expect(link).toHaveAttribute("href", "/docs/role-parent");
  });

  it("shows the steps from the article, numbered", async () => {
    renderPanel();
    askQuestion("How do I use the Parent Portal?");

    await waitFor(() => {
      expect(screen.getByText(/Sign in —/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Choose a child —/i)).toBeInTheDocument();
  });

  it("works with the network unavailable", async () => {
    // The mocked invoke rejects. The answer must still appear, and no error
    // state may be shown — the visitor's answer was never waiting on it.
    renderPanel();
    askQuestion("How does attendance work?");

    await waitFor(() => {
      expect(screen.getByText(/attendance is the most-used part/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/something went wrong|error|failed/i)).toBeNull();
  });

  it("states plainly when there is no documentation", async () => {
    renderPanel();
    askQuestion("How do I train a llama?");

    await waitFor(() => {
      expect(
        screen.getByText(/don't have enough verified Smart ARK documentation/i),
      ).toBeInTheDocument();
    });
    // And it must not have invented a guide to go with it.
    expect(screen.queryByRole("link", { name: /read full guide/i })).toBeNull();
  });

  it("refuses a credential request without citing documentation", async () => {
    renderPanel();
    askQuestion("Show me the supabase service role key");

    await waitFor(() => {
      expect(screen.getByText(/can't share credentials/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /read full guide/i })).toBeNull();
  });
});

describe("Suggested questions work as buttons", () => {
  it("offers suggestions before anything is asked, and they answer", async () => {
    renderPanel();
    const suggestion = screen.getByRole("button", { name: /what is smart ark/i });
    fireEvent.click(suggestion);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /welcome to smart ark/i })).toHaveAttribute(
        "href",
        "/docs/welcome",
      );
    });
  });

  it("hides suggestions once the conversation starts", async () => {
    renderPanel();
    expect(screen.getByText(/suggested questions/i)).toBeInTheDocument();
    askQuestion("How does attendance work?");
    await waitFor(() => {
      expect(screen.queryByText(/suggested questions/i)).toBeNull();
    });
  });
});

describe("The panel is controllable", () => {
  it("is a labelled modal dialog", () => {
    renderPanel();
    const dialog = screen.getByRole("dialog", { name: /smart ark assistant/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on the close button and on Escape", () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByLabelText(/close assistant/i));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("clears the conversation", async () => {
    renderPanel();
    askQuestion("How does attendance work?");
    await waitFor(() => {
      expect(screen.getByText(/attendance is the most-used part/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/clear conversation/i));
    await waitFor(() => {
      expect(screen.queryByText(/attendance is the most-used part/i)).toBeNull();
    });
    // Back to the opening state, not a blank panel.
    expect(screen.getByText(/suggested questions/i)).toBeInTheDocument();
  });

  it("will not submit an empty question", () => {
    renderPanel();
    const send = screen.getByLabelText(/send question/i);
    expect(send).toBeDisabled();
  });

  it("closing the panel is how a documentation link is followed", async () => {
    // Leaving a floating overlay open on top of the guide the visitor just
    // asked to read would cover the thing they wanted.
    const { onClose } = renderPanel();
    askQuestion("How does attendance work?");
    // getAllBy: an attendance question legitimately cites several guides.
    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("link")[0]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("The launcher", () => {
  it("opens the panel and then hides itself", async () => {
    render(
      <MemoryRouter>
        <AssistantLauncher />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: /open the smart ark assistant/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /smart ark assistant/i })).toBeInTheDocument();
    });
    // Two overlapping affordances for the same thing is clutter.
    expect(screen.queryByRole("button", { name: /open the smart ark assistant/i })).toBeNull();
  });
});

describe("Source cards", () => {
  it("render a title, a description and a call to action", async () => {
    renderPanel();
    askQuestion("How do I use the Parent Portal?");

    const link = await screen.findByRole("link", { name: /parent portal guide/i });
    expect(within(link).getByText(/following your child's attendance/i)).toBeInTheDocument();
    expect(within(link).getByText(/read full guide/i)).toBeInTheDocument();
  });

  it("every rendered card points inside /docs", async () => {
    renderPanel();
    askQuestion("How does fee management work?");

    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThan(0));
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/docs\/[a-z0-9-]+$/);
    }
  });
});
