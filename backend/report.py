"""결산보고서 엑셀 파일을 만든다.

총대의원회 공식 양식(backend/templates/settlement_template.xlsx, 원본: docs/raw/(학과) 결산보고서 양식_수정.xlsx)을
그대로 열어서 우리 데이터만 채운다. 시트: 표지, 기안서, 결산서.
- 결산서: 단위사업마다 '소   계' 줄 1개 + 세부 줄(세부사항, 비목, 예산액, 지출액, 잔액, 지출근거, 단가, 수량)
  지출 1건 = 세부 줄 1줄 (단가 = 금액, 수량 = 1). 예산만 있고 지출이 없는 비목도 한 줄 남긴다.
  예산액은 그 사업·비목의 첫 줄에만 적는다 (소계가 예산과 같아지도록).
- 오른쪽 비목별 표, 총운영비 등은 양식에 들어 있는 수식이 자동 계산한다.
- 학과 이름, 수입(학생회비·지원금·이월액), 지출근거(제품명)는 앱에 없어서 비워 두거나 양식 그대로 둔다.
"""
import io
from copy import copy
from datetime import date
from pathlib import Path

from openpyxl import load_workbook

TEMPLATE = Path(__file__).parent / "templates" / "settlement_template.xlsx"
FIRST_ROW = 13  # 결산서 시트에서 사업 블록이 시작되는 줄
LAST_COL = 9    # A~I 열만 사업별 결산 (K열부터는 비목별 표라 건드리지 않음)


def _styles(ws, row):
    return [copy(ws.cell(row=row, column=c)._style) for c in range(1, LAST_COL + 1)], ws.row_dimensions[row].height


def _put_row(ws, row, style, values):
    styles, height = style
    for c in range(1, LAST_COL + 1):
        cell = ws.cell(row=row, column=c)
        cell._style = copy(styles[c - 1])
        cell.value = values.get(c)
    ws.row_dimensions[row].height = height


def build_settlement(budgets, expenses, period_name, year, parents=None):
    parents = parents or {}
    wb = load_workbook(TEMPLATE)
    today = date.today().strftime("%Y.%m.%d")

    # 표지·기안서: 연도·학기·날짜만 바꾼다 (학과 이름 'oo학과'는 직접 고치도록 그대로 둔다)
    for name in ("표지", "기안서"):
        for row in wb[name].iter_rows():
            for cell in row:
                if isinstance(cell.value, str):
                    v = cell.value.replace("2026", str(year)).replace("2026.00.00", today)
                    v = v.replace("0학기", period_name).replace("1학기", period_name).replace(f"{year}.00.00", today)
                    cell.value = v

    ws = wb["결산서"]
    ws["A1"] = f"{year}년도 {period_name} 00학과 결산보고서"
    for ref in ("D7", "D8", "D9"):  # 양식의 예시 수입 금액은 지운다 (앱에 수입 자료가 없음)
        ws[ref] = None

    head_style, line_style = _styles(ws, FIRST_ROW), _styles(ws, FIRST_ROW + 1)
    # 양식의 예시 사업 블록(A~I열)을 지운다
    for rng in [r for r in ws.merged_cells.ranges if r.min_row >= FIRST_ROW and r.max_col <= LAST_COL]:
        ws.unmerge_cells(str(rng))
    blank = copy(ws.cell(row=ws.max_row + 5, column=1)._style)
    for row in range(FIRST_ROW, ws.max_row + 1):
        for c in range(1, LAST_COL + 1):
            ws.cell(row=row, column=c).value = None
            ws.cell(row=row, column=c)._style = copy(blank)

    # 사업 순서: 상위 사업 바로 뒤에 묶인 하위 사업
    names = sorted({b["event_name"] for b in budgets} | {e["event_name"] for e in expenses})
    order = []
    for n in sorted({parents.get(n, n) for n in names}):
        order += [n] if n in names else []
        order += sorted(c for c in names if parents.get(c) == n and c != n)

    row = FIRST_ROW
    for event in order:
        lines = []
        cats = sorted({b["category"] for b in budgets if b["event_name"] == event} |
                      {e["category"] for e in expenses if e["event_name"] == event})
        for cat in cats:
            budget = sum(b["amount"] for b in budgets if b["event_name"] == event and b["category"] == cat)
            spent = sorted((e for e in expenses if e["event_name"] == event and e["category"] == cat), key=lambda e: e["date"])
            if not spent:
                lines.append({2: "(지출 없음)", 3: cat, 4: budget})
            for i, e in enumerate(spent):
                lines.append({2: f"{e['description']} ({e['date'][5:].replace('-', '.')})", 3: cat,
                              4: budget if i == 0 else 0, 8: e["amount"], 9: 1})
        head, first, last = row, row + 1, row + len(lines)
        _put_row(ws, head, head_style, {1: event, 2: "소   계", 4: f"=SUM(D{first}:D{last})", 5: f"=SUM(E{first}:E{last})",
                                        6: f"=SUM(F{first}:F{last})", 7: "제품명", 8: "단가", 9: "수량"})
        ws.merge_cells(start_row=head, start_column=2, end_row=head, end_column=3)
        for r, values in enumerate(lines, start=first):
            _put_row(ws, r, line_style, {**values, 5: f"=H{r}*I{r}", 6: f"=D{r}-E{r}"})
        ws.merge_cells(start_row=head, start_column=1, end_row=last, end_column=1)
        row = last + 1

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
