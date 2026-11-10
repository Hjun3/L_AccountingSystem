"""은행 거래내역 엑셀 파일(카카오뱅크, 토스뱅크 등)에서 출금 내역을 읽는다.

은행마다 열 순서와 이름이 조금씩 다르므로, 정해진 열 위치 대신
'거래일시', '거래금액', '내용' 같은 열 이름을 찾아서 읽는다.
"""
import io
import re
from datetime import datetime

import msoffcrypto
from openpyxl import load_workbook

# 열 이름 후보 (띄어쓰기는 지우고 비교한다). 앞에 있는 이름을 먼저 찾는다.
COLUMN_NAMES = {
    "datetime": ["거래일시", "거래일자", "일시", "날짜"],
    "amount": ["거래금액", "금액"],
    "withdraw": ["출금금액", "출금액", "찾으신금액"],
    "deposit": ["입금금액", "입금액", "맡기신금액"],
    "kind": ["구분", "거래구분", "거래유형"],
    "content": ["내용", "적요", "거래내용", "받는분", "기재내용"],
    "balance": ["거래후잔액", "잔액"],
}


class BankImportError(Exception):
    """엑셀 파일을 거래내역으로 읽을 수 없을 때 사용하는 에러"""


def _clean(value) -> str:
    return re.sub(r"\s", "", str(value or ""))


def _to_int(value) -> int:
    """'-23,000원' 같은 값을 정수로 바꾼다. 빈 값은 0."""
    if isinstance(value, (int, float)):
        return int(value)
    text = re.sub(r"[^\d\-]", "", str(value or ""))
    return int(text) if text not in ("", "-") else 0


def _to_datetime(value):
    """'2026.04.16 14:30:00', '2026-04-16' 등 여러 날짜 형식을 읽는다."""
    if isinstance(value, datetime):
        return value
    match = re.search(r"(\d{4})\D(\d{1,2})\D(\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", str(value or ""))
    if not match:
        return None
    y, m, d, hh, mm, ss = match.groups()
    return datetime(int(y), int(m), int(d), int(hh or 0), int(mm or 0), int(ss or 0))


def _find_header(rows):
    """위에서부터 30줄 안에서 '거래일시' 같은 날짜 열 이름이 있는 줄을 찾아 열 위치를 정한다."""
    for row_index, row in enumerate(rows[:30]):
        names = [_clean(v) for v in row]
        columns = {}
        for key, candidates in COLUMN_NAMES.items():
            for candidate in candidates:
                if candidate in names:
                    columns[key] = names.index(candidate)
                    break
        has_amount = "amount" in columns or "withdraw" in columns
        if "datetime" in columns and has_amount:
            return row_index, columns
    raise BankImportError("거래일시와 금액 열을 찾지 못했습니다. 은행에서 받은 거래내역 엑셀 파일인지 확인하세요.")


def _decrypt_if_needed(file_bytes: bytes, password: str) -> bytes:
    """은행 앱이 보내 주는 비밀번호 걸린 엑셀이면 비밀번호로 풀어서 돌려준다. (비밀번호는 저장하지 않음)"""
    try:
        office_file = msoffcrypto.OfficeFile(io.BytesIO(file_bytes))
        encrypted = office_file.is_encrypted()
    except Exception:
        return file_bytes  # 일반 xlsx 파일 (암호 없음)
    if not encrypted:
        return file_bytes
    if not password:
        raise BankImportError("비밀번호가 걸린 파일입니다. 은행에서 안내한 파일 비밀번호를 입력해 주세요.")
    try:
        office_file.load_key(password=password)
        out = io.BytesIO()
        office_file.decrypt(out)
        return out.getvalue()
    except Exception:
        raise BankImportError("파일 비밀번호가 맞지 않습니다.")


def parse_withdrawals(file_bytes: bytes, password: str = "") -> list[dict]:
    """엑셀 파일에서 출금 거래만 골라 돌려준다. (지출과 맞춰 보는 데 사용)"""
    return [t for t in parse_transactions(file_bytes, password) if t["direction"] == "출금"]


def parse_transactions(file_bytes: bytes, password: str = "") -> list[dict]:
    """엑셀 파일의 모든 거래를 [{datetime, date, direction(입금/출금), amount, content, balance}, ...]로 돌려준다."""
    file_bytes = _decrypt_if_needed(file_bytes, password)
    try:
        workbook = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    except Exception:
        raise BankImportError("엑셀(xlsx) 파일을 열 수 없습니다. xls 파일이면 엑셀에서 xlsx로 다시 저장해 주세요.")

    rows = [list(r) for r in workbook.worksheets[0].iter_rows(values_only=True)]
    header_index, col = _find_header(rows)

    def cell(row, key):
        return row[col[key]] if key in col and col[key] < len(row) else None

    transactions = []
    for row in rows[header_index + 1:]:
        when = _to_datetime(cell(row, "datetime"))
        if when is None:
            continue  # 빈 줄이나 합계 줄은 건너뜀

        kind = _clean(cell(row, "kind"))
        if "withdraw" in col:
            # 출금액/입금액 열이 따로 있는 은행
            out_amount = _to_int(cell(row, "withdraw"))
            direction = "출금" if out_amount > 0 else "입금"
            amount = out_amount if out_amount > 0 else _to_int(cell(row, "deposit"))
        else:
            # 거래금액 하나에 입금은 +, 출금은 - 로 적는 은행
            signed = _to_int(cell(row, "amount"))
            is_withdraw = (signed < 0 or "출금" in kind or "결제" in kind) and "입금" not in kind
            direction = "출금" if is_withdraw else "입금"
            amount = abs(signed)
        if amount <= 0:
            continue  # 금액이 없는 줄은 건너뜀

        transactions.append({
            "datetime": when.isoformat(timespec="seconds"),
            "date": when.date().isoformat(),
            "direction": direction,
            "amount": amount,
            "content": str(cell(row, "content") or "").strip(),
            "balance": _to_int(cell(row, "balance")) if "balance" in col else None,
        })
    return transactions
