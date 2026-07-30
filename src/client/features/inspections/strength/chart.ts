import type { StrengthResultSeries } from "./types.js";

export interface StrengthChartInstance {
  destroy(): void;
}

export interface StrengthChartConstructor {
  new (
    context: CanvasRenderingContext2D,
    config: Record<string, unknown>
  ): StrengthChartInstance;
}

export interface StrengthChartController {
  render(series: StrengthResultSeries, hasActual: boolean): boolean;
  destroy(): void;
}

export interface StrengthChartDependencies {
  canvas: HTMLCanvasElement | null;
  getChartConstructor(): StrengthChartConstructor | null;
}

export function createStrengthChartController({
  canvas,
  getChartConstructor
}: StrengthChartDependencies): StrengthChartController {
  let chart: StrengthChartInstance | null = null;

  function destroy() {
    chart?.destroy();
    chart = null;
    if (canvas) canvas.style.display = "none";
  }

  function render(series: StrengthResultSeries, hasActual: boolean) {
    const Chart = getChartConstructor();
    const context = canvas?.getContext("2d") || null;
    if (!Chart || !canvas || !context) return false;

    chart?.destroy();
    canvas.style.display = "block";
    chart = new Chart(context, {
      type: "line",
      data: {
        labels: series.labels,
        datasets: [
          {
            label: "Нормативная кривая",
            data: series.normative,
            borderColor: "#60a5fa",
            borderWidth: 2,
            fill: false
          },
          {
            label: "Фактическая прочность",
            data: series.actual,
            borderColor: "#f87171",
            pointRadius: hasActual ? 6 : 0,
            pointBackgroundColor: "#f87171",
            spanGaps: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#e5e7eb" }
          }
        },
        scales: {
          x: {
            ticks: { color: "#cbd5e1" },
            grid: { color: "#3b3d42" }
          },
          y: {
            beginAtZero: true,
            ticks: { color: "#cbd5e1" },
            grid: { color: "#3b3d42" }
          }
        }
      }
    });
    return true;
  }

  return { render, destroy };
}
