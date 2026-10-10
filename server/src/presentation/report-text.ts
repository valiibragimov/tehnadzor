import type { components } from "../../../src/shared/api-schema";
type ReportSummary = components["schemas"]["ReportRequest"]["summaryData"];

/**
 * Формирует текст отчёта в стиле технадзора
 */
export function buildReportText(data: ReportSummary) {
  const {
    project = "—",
    construction = "—",
    date = new Date().toISOString().slice(0, 10),
    engineer = "—",
    geo = { total: 0, exceeded: 0 },
    reinf = { total: 0, exceeded: 0 },
    geom = { total: 0, exceeded: 0 },
    strength = { total: 0, exceeded: 0 }
  } = data;

  const totalChecks = geo.total + reinf.total + geom.total + strength.total;
  const totalExceeded = geo.exceeded + reinf.exceeded + geom.exceeded + strength.exceeded;

  const modules = [
    { name: "Геодезия", total: geo.total, exceeded: geo.exceeded },
    { name: "Армирование", total: reinf.total, exceeded: reinf.exceeded },
    { name: "Геометрия", total: geom.total, exceeded: geom.exceeded },
    { name: "Прочность бетона", total: strength.total, exceeded: strength.exceeded }
  ];

  const getStatusText = (module) => {
    if (module.total === 0) return "Проверки не выполнялись";
    return module.exceeded > 0 ? "Выявлены отклонения" : "Соответствует требованиям";
  };

  let conclusionText = "";
  if (totalChecks === 0) {
    conclusionText = "Проверки по выбранному разделу не выполнялись. Для формирования окончательного заключения необходимо выполнить строительный контроль по установленному перечню параметров.";
  } else if (totalExceeded === 0) {
    conclusionText = "По результатам выполненных проверок отклонений, превышающих допустимые значения, не выявлено. Проверенные параметры соответствуют установленным требованиям проектной и нормативной документации.";
  } else {
    conclusionText = "По результатам выполненных проверок выявлены отклонения, превышающие допустимые значения. Требуется выполнение корректирующих мероприятий и проведение повторного контроля по выявленным замечаниям.";
  }

  const lines = [
    "ИТОГОВОЕ ЗАКЛЮЧЕНИЕ",
    "",
    "1. Общие сведения",
    `Объект: ${project}`,
    `Вид конструкций / раздел проверок: ${construction}`,
    `Дата формирования документа: ${date}`,
    `ФИО инженера: ${engineer}`,
    "Документ сформирован в системе «Технадзор онлайн».",
    "",
    "Основание:",
    "«Заключение сформировано по результатам проверок, выполненных в рамках строительного контроля (технического надзора) по объекту.»",
    "",
    "2. Результаты проверок"
  ];

  modules.forEach((module) => {
    lines.push(module.name);
    lines.push(`  Количество выполненных проверок: ${module.total}`);
    lines.push(`  Выявлено превышений: ${module.exceeded}`);
    lines.push(`  Статус: ${getStatusText(module)}`);
    lines.push("");
  });

  lines.push(`Итого количество выполненных проверок: ${totalChecks}`);
  lines.push(`Итого выявлено превышений: ${totalExceeded}`);
  lines.push("");
  lines.push("3. Итоговое заключение");
  lines.push(conclusionText);
  lines.push("");
  lines.push(`Инженер технического контроля: ${engineer}`);
  lines.push("Подпись: ____________");
  lines.push(`Дата: ${date}`);
  lines.push("Документ сформирован автоматически.");

  return lines.join("\n");
}
