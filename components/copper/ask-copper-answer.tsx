// How one Ask Copper answer is drawn: a line of "stations" hanging off a
// vertical rail, in the order they happened (spec.md, section 5): the tools
// Copper could use, what it was thinking, each tool it called (what it sent,
// what came back), and then the reply.
import {
  BrainIcon,
  ListIcon,
  Loader2Icon,
  TriangleAlertIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  formatUsd,
  getPlans,
  getProducts,
  type ProductId,
} from "@/lib/copper/catalog";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

const TOOL_NAMES = Object.keys(TOOL_LABELS);

type Rec = Record<string, unknown>;
const isRecord = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const productName = (id: unknown) =>
  getProducts().find((p) => p.id === (id as ProductId))?.name ?? String(id);
const planName = (id: unknown) =>
  getPlans().find((p) => p.id === id)?.name ?? String(id);

/** "Brushed Copper, Desert Sand and Night Sky". */
function listOf(items: string[]) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "2026-11-14" -> "Nov 14, 2026". */
function niceDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Gemini's thought summaries arrive as markdown: **headings** and `code`. */
function Markdown({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

// ---------------------------------------------------------------------------
// The rail and its stations
// ---------------------------------------------------------------------------

function Station({
  icon: Icon,
  nodeClass,
  label,
  children,
  pulse,
}: {
  icon?: LucideIcon;
  nodeClass: string;
  label?: string;
  children?: ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="relative pb-4 pl-9 last:pb-0">
      <span
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-6 items-center justify-center rounded-full ring-4",
          nodeClass,
          pulse && "animate-pulse",
        )}
      >
        {Icon ? (
          <Icon className="size-3.5" />
        ) : (
          <span className="flex gap-0.5" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1 animate-bounce rounded-full bg-current"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        )}
      </span>
      {label && (
        <p className="text-muted-foreground pt-1 text-[11px] font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function ToolsStation({
  used,
  useTools,
}: {
  used: Set<string>;
  useTools: boolean;
}) {
  return (
    <Station
      icon={ListIcon}
      nodeClass={
        useTools
          ? "bg-primary text-primary-foreground"
          : "bg-chart-3 text-primary-foreground"
      }
      label={useTools ? "Tools Copper can use" : "Tools given to Copper: none"}
    >
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TOOL_NAMES.map((name) => (
          <span
            key={name}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-xs",
              !useTools && "text-muted-foreground bg-muted line-through",
              useTools &&
                used.has(name) &&
                "bg-accent text-accent-foreground font-bold",
              useTools && !used.has(name) && "bg-muted text-muted-foreground",
            )}
          >
            {name}
          </span>
        ))}
      </div>
      {!useTools && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          Copper has to answer from memory alone.
        </p>
      )}
    </Station>
  );
}

// ---------------------------------------------------------------------------
// The tool card
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="text-muted-foreground w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  );
}

function Sent({ step }: { step: ToolStep }) {
  const { name, input } = step;
  if (name === "get_products")
    return <p className="text-sm">Nothing, it just asked what Copper sells.</p>;
  if (name === "get_prices")
    return (
      <p className="text-sm">Nothing, it just asked for the price list.</p>
    );
  if (!isRecord(input))
    return (
      <p className="text-muted-foreground text-sm">filling in the details…</p>
    );
  if (name === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <dl className="space-y-1">
        <Row label="Products">
          {products.length ? products.map(productName).join(", ") : "None"}
        </Row>
        <Row label="Plan">{planName(input.plan)}</Row>
        <Row label="Billing">{String(input.billing)}</Row>
        <Row label="Years">{String(input.years)}</Row>
      </dl>
    );
  }
  if (name === "compare_products") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <dl className="space-y-1">
        <Row label="Comparing">{products.map(productName).join(" vs. ")}</Row>
      </dl>
    );
  }
  if (name === "check_availability")
    return (
      <dl className="space-y-1">
        <Row label="Product">{productName(input.product)}</Row>
        <Row label="Color">
          {typeof input.color === "string" && input.color
            ? input.color
            : "All colors"}
        </Row>
      </dl>
    );
  return (
    <dl className="space-y-1">
      {Object.entries(input).map(([key, value]) => (
        <Row key={key} label={key}>
          {String(value)}
        </Row>
      ))}
    </dl>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Back({ step }: { step: ToolStep }) {
  const { name, output } = step;
  if (step.state === "error")
    return <p className="text-sm">The tool had a problem: {String(output)}</p>;
  if (!isRecord(output))
    return <p className="text-muted-foreground text-sm">Nothing came back.</p>;

  if (name === "calculate_cost" && Array.isArray(output.lines)) {
    return (
      <div className="space-y-1 text-sm">
        {(output.lines as Rec[]).map((line, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span>{String(line.item)}</span>
            <span className="tabular-nums">{formatUsd(Number(line.usd))}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t pt-1">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-bold tabular-nums">
            {formatUsd(Number(output.totalUsd))}
          </span>
        </div>
      </div>
    );
  }

  if (name === "get_products" && Array.isArray(output.products)) {
    return (
      <div className="space-y-2 text-sm">
        {(output.products as Rec[]).map((p, i) => (
          <div key={i}>
            <p className="flex justify-between gap-3 font-medium">
              <span>{String(p.name)}</span>
              <span>{formatUsd(Number(p.priceUsd))}</span>
            </p>
            <p className="text-muted-foreground text-xs">{String(p.type)}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(Array.isArray(p.colors) ? p.colors : []).map((color) => (
                <Pill key={String(color)} className="bg-accent">
                  {String(color)}
                </Pill>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (name === "compare_products" && Array.isArray(output.products)) {
    const shared = Array.isArray(output.sharedColors)
      ? output.sharedColors.map(String)
      : [];
    return (
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          {(output.products as Rec[]).map((p, i) => (
            <div key={i} className="space-y-1">
              <p className="font-medium">{String(p.name)}</p>
              <p className="text-primary font-bold">
                {formatUsd(Number(p.priceUsd))}
              </p>
              <p className="text-muted-foreground text-xs">{String(p.type)}</p>
              <ul className="list-disc pl-4 text-xs">
                {(Array.isArray(p.features) ? p.features : []).map((f) => (
                  <li key={String(f)}>{String(f)}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1">
                {(Array.isArray(p.colors) ? p.colors : []).map((color) => (
                  <Pill key={String(color)} className="bg-accent">
                    {String(color)}
                  </Pill>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="border-t pt-2">
          {output.cheaper
            ? `${String(output.cheaper)} costs ${formatUsd(Number(output.priceDifferenceUsd))} less.`
            : "They cost the same."}
          {shared.length > 0 && ` Both come in ${listOf(shared)}.`}
        </p>
      </div>
    );
  }

  if (name === "get_prices" && Array.isArray(output.products)) {
    const plans = (
      Array.isArray(output.plans) ? (output.plans as Rec[]) : []
    ).filter((p) => Number(p.monthlyUsd) > 0);
    return (
      <div className="space-y-1 text-sm">
        {(output.products as Rec[]).map((p, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span>{String(p.name)}</span>
            <span>{formatUsd(Number(p.priceUsd))}</span>
          </div>
        ))}
        {plans.map((p, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span>{String(p.name)}</span>
            <span>
              {formatUsd(Number(p.monthlyUsd))}/mo ·{" "}
              {formatUsd(Number(p.annualUsd))}/yr
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (name === "check_availability") {
    if (output.status === "unavailable")
      return <p className="text-sm">{String(output.message)}</p>;
    if (output.status === "not_a_color") {
      const colors = Array.isArray(output.colors)
        ? output.colors.map(String)
        : [];
      return (
        <p className="text-sm">
          {String(output.product)} doesn&apos;t come in {String(output.color)}.
          It comes in {listOf(colors)}.
        </p>
      );
    }
    if (output.status === "ok" && Array.isArray(output.colors)) {
      return (
        <div className="space-y-1 text-sm">
          {(output.colors as Rec[]).map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span>{String(c.color)}</span>
              {c.stock === "in_stock" && (
                <Pill className="bg-accent">In stock</Pill>
              )}
              {c.stock === "low_stock" && (
                <Pill className="bg-chart-4">Low stock</Pill>
              )}
              {c.stock === "backordered" && (
                <Pill className="bg-chart-3">
                  Back-ordered
                  {typeof c.restockDate === "string" &&
                    ` until ${niceDate(c.restockDate)}`}
                </Pill>
              )}
            </div>
          ))}
        </div>
      );
    }
  }

  return <p className="text-muted-foreground text-sm">Done.</p>;
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  const calling = step.state === "calling";
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-background mt-1.5 overflow-hidden rounded-lg border"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono text-sm font-bold">{step.name}()</span>
        <span className="bg-background/30 rounded px-1.5 text-[11px]">
          tool {number}
        </span>
        <span className="ml-auto text-xs">
          {TOOL_LABELS[step.name] ?? step.name}
        </span>
      </div>
      <div className="space-y-1.5 p-3">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
          <span aria-hidden>→ </span>What Copper sent
        </p>
        <Sent step={step} />
      </div>
      <div className="bg-accent/10 space-y-1.5 border-t p-3">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
          <span aria-hidden>← </span>What came back
        </p>
        {calling ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Loader2Icon className="size-3.5 animate-spin" />
            the app is running the code…
          </p>
        ) : (
          <Back step={step} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One whole answer
// ---------------------------------------------------------------------------

export function CopperAnswer({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const working = progress.status === "working";
  const used = new Set(
    progress.steps.flatMap((s) => (s.type === "tool" ? [s.name] : [])),
  );
  const railClass = useTools
    ? "from-primary via-accent to-accent"
    : "from-chart-3 to-chart-3";
  const working_text = progress.reply
    ? "Writing the answer…"
    : !useTools
      ? "Answering from memory…"
      : progress.steps.length
        ? "Deciding what to do next…"
        : "Reading your question…";

  // Count tool calls up front, so the JSX below only reads a ready-made list.
  const stations = progress.steps.map((step, i) => ({
    step,
    key: i,
    toolNumber:
      step.type === "tool"
        ? progress.steps.slice(0, i + 1).filter((s) => s.type === "tool").length
        : 0,
  }));

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          aria-hidden
          className={cn(
            "absolute top-2 bottom-2 left-3 w-0.5 -translate-x-1/2 bg-linear-to-b",
            railClass,
          )}
        />
        <ToolsStation used={used} useTools={useTools} />
        {stations.map(({ step, key, toolNumber }) =>
          step.type === "thinking" ? (
            <Station
              key={key}
              icon={BrainIcon}
              nodeClass={
                useTools
                  ? "bg-primary text-primary-foreground"
                  : "bg-chart-3 text-primary-foreground"
              }
              label="Copper is thinking"
            >
              <p
                data-testid="thinking"
                className="text-muted-foreground mt-1 border-l-2 pl-3 text-sm italic"
              >
                <Markdown text={step.text} />
              </p>
            </Station>
          ) : (
            <Station
              key={key}
              icon={WrenchIcon}
              nodeClass="bg-accent text-accent-foreground"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={toolNumber} />
            </Station>
          ),
        )}
        {working && (
          <Station nodeClass="bg-primary text-primary-foreground" pulse>
            <p className="text-muted-foreground pt-0.5 text-sm">
              {working_text}
            </p>
          </Station>
        )}
      </div>

      {progress.reply && (
        <div className="bg-background ml-9 rounded-xl rounded-tl-none border p-3 shadow-xs">
          <p className="text-primary mb-1 text-xs font-semibold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 mb-2 flex gap-2 rounded-md border p-2 text-xs">
              <TriangleAlertIcon className="text-chart-3 mt-0.5 size-4 shrink-0" />
              <p>
                <strong>Answered without tools: may be made up</strong>
                <br />
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">
            {progress.reply}
            {working && (
              <span
                aria-hidden
                className="bg-primary ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle"
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
}
