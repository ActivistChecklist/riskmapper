import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { installMatrixTestDomPolyfills } from "@/components/risk-matrix/testDomPolyfills";
import {
  SuppressTooltips,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

function OpenTooltip({ suppressed }: { suppressed: boolean }) {
  return (
    <SuppressTooltips when={suppressed}>
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger>Star</TooltipTrigger>
          <TooltipContent>Add to actions list</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </SuppressTooltips>
  );
}

describe("SuppressTooltips", () => {
  it("lets tooltips open normally when off", () => {
    render(<OpenTooltip suppressed={false} />);
    expect(screen.getAllByText("Add to actions list").length).toBeGreaterThan(0);
  });

  it("keeps tooltips closed while on, as during a drag", () => {
    render(<OpenTooltip suppressed />);
    expect(screen.queryByText("Add to actions list")).toBeNull();
  });
});
