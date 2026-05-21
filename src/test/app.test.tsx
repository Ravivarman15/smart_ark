import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import App from "../App";
import Login from "../pages/Login";
import { AppProviders } from "../core/providers/AppProviders";
import { BrowserRouter } from "react-router-dom";

describe("App Rendering", () => {
  it("renders App wrapper", () => {
    const { container } = render(<App />);
    expect(container).toBeDefined();
  });

  it("renders Login page", () => {
    const { container } = render(
      <AppProviders>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </AppProviders>
    );
    expect(container).toBeDefined();
  });
});
