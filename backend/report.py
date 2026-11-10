"""결산보고서 엑셀 파일을 만든다.

시트 3개: 사업별 결산(예산 대비 지출), 비목별 집계, 지출 내역
학생회 결산서처럼 사업(단위사업)별로 비목을 나열하고 소계·합계를 붙인다.
"""
import io
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

BOLD = Font(bold=True)
HEADER_FILL = PatternFill("solid", fgColor="DDDDDD")
SUBTOTAL_FILL = PatternFill("solid", fgColor="F3F3F3")
MONEY = "#,##0"


def _header(ws, row, titles, widths):
    for col, (title, width) in enumerate(zip(titles, widths), start=1):
        cell = ws.cell(row=row, column=col, value=title)
        cell.font, cell.fill = BOLD, HEADER_FILL
        ws.column_dimensions[cell.column_letter].width = width


def _rate(spent, budget):
    return f"{round(spent / budget * 100)}%" if budget else "-"


def build_settlement(budgets, expenses, period_text):
    """budgets: [{event_name, category, amount}], expenses: 기간 안의 지출 목록 → 엑셀 파일 bytes"""
    # 사업명·비목별 지출 합계
    spent = {}
    for e in expenses:
        key = (e["event_name"], e["category"])
        spent[key] = spent.get(key, 0) + e["amount"]

    # 예산 줄 + 예산 없이 쓴 지출 줄을 합쳐 사업별로 묶는다
    lines = {}
    for b in budgets:
        lines[(b["event_name"], b["category"])] = b["amount"]
    for key in spent:
        lines.setdefault(key, 0)
    by_event = {}
    for (event_name, category), budget in sorted(lines.items()):
        by_event.setdefault(event_name, []).append((category, budget, spent.get((event_name, category), 0)))

    wb = Workbook()

    # 1) 사업별 결산
    ws = wb.active
    ws.title = "사업별 결산"
    ws["A1"] = "결산보고서"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"기간: {period_text}"
    ws["A3"] = f"작성일: {date.today().isoformat()}"
    _header(ws, 5, ["단위사업", "비목", "예산액", "지출액", "잔액", "집행률"], [20, 12, 14, 14, 14, 10])
    row = 6
    total_budget = total_spent = 0
    for event_name, items in by_event.items():
        for category, budget, used in items:
            ws.append([event_name, category, budget, used, budget - used, _rate(used, budget)])
            row += 1
        eb, es = sum(i[1] for i in items), sum(i[2] for i in items)
        ws.append([f"{event_name} 소계", "", eb, es, eb - es, _rate(es, eb)])
        row += 1
        for cell in ws[row - 1]:
            cell.font, cell.fill = BOLD, SUBTOTAL_FILL
        total_budget, total_spent = total_budget + eb, total_spent + es
    ws.append(["합계", "", total_budget, total_spent, total_budget - total_spent, _rate(total_spent, total_budget)])
    for cell in ws[ws.max_row]:
        cell.font = BOLD
    for r in ws.iter_rows(min_row=6, min_col=3, max_col=5):
        for cell in r:
            cell.number_format = MONEY

    # 2) 비목별 집계
    ws2 = wb.create_sheet("비목별")
    _header(ws2, 1, ["비목", "예산액", "지출액", "잔액", "지출 비율"], [12, 14, 14, 14, 10])
    by_category = {}
    for (_, category), budget in lines.items():
        b, s = by_category.get(category, (0, 0))
        by_category[category] = (b + budget, s)
    for (_, category), used in spent.items():
        b, s = by_category[category]
        by_category[category] = (b, s + used)
    for category, (budget, used) in sorted(by_category.items(), key=lambda x: -x[1][1]):
        share = f"{round(used / total_spent * 100)}%" if total_spent else "-"
        ws2.append([category, budget, used, budget - used, share])
    ws2.append(["합계", total_budget, total_spent, total_budget - total_spent, "100%" if total_spent else "-"])
    for cell in ws2[ws2.max_row]:
        cell.font = BOLD
    for r in ws2.iter_rows(min_row=2, min_col=2, max_col=4):
        for cell in r:
            cell.number_format = MONEY

    # 3) 지출 내역
    ws3 = wb.create_sheet("지출 내역")
    _header(ws3, 1, ["날짜", "단위사업", "비목", "지출 내용", "금액", "증빙", "총무 결정", "메모"], [12, 18, 10, 50, 12, 6, 10, 30])
    for e in sorted(expenses, key=lambda x: (x["date"], x["id"])):
        ws3.append([e["date"], e["event_name"], e["category"], e["description"], e["amount"],
                    "있음" if e["has_receipt"] else "없음", {"소명": "확정"}.get(e["final_status"], e["final_status"]), e.get("memo") or ""])
    for r in ws3.iter_rows(min_row=2, min_col=5, max_col=5):
        for cell in r:
            cell.number_format = MONEY

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
