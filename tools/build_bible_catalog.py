"""Build an edition-specific, text-only chapter catalogue from official downloads."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "verification" / "bible-sources"
BOOKS = [
    ("GEN", "Genesis", 50), ("EXO", "Exodus", 40), ("LEV", "Leviticus", 27),
    ("NUM", "Numbers", 36), ("DEU", "Deuteronomy", 34), ("JOS", "Joshua", 24),
    ("JDG", "Judges", 21), ("RUT", "Ruth", 4), ("1SA", "1 Samuel", 31),
    ("2SA", "2 Samuel", 24), ("1KI", "1 Kings", 22), ("2KI", "2 Kings", 25),
    ("1CH", "1 Chronicles", 29), ("2CH", "2 Chronicles", 36), ("EZR", "Ezra", 10),
    ("NEH", "Nehemiah", 13), ("EST", "Esther", 10), ("JOB", "Job", 42),
    ("PSA", "Psalm", 150), ("PRO", "Proverbs", 31), ("ECC", "Ecclesiastes", 12),
    ("SOL", "Song of Solomon", 8), ("ISA", "Isaiah", 66), ("JER", "Jeremiah", 52),
    ("LAM", "Lamentations", 5), ("EZE", "Ezekiel", 48), ("DAN", "Daniel", 12),
    ("HOS", "Hosea", 14), ("JOE", "Joel", 3), ("AMO", "Amos", 9),
    ("OBA", "Obadiah", 1), ("JON", "Jonah", 4), ("MIC", "Micah", 7),
    ("NAH", "Nahum", 3), ("HAB", "Habakkuk", 3), ("ZEP", "Zephaniah", 3),
    ("HAG", "Haggai", 2), ("ZEC", "Zechariah", 14), ("MAL", "Malachi", 4),
    ("MAT", "Matthew", 28), ("MAR", "Mark", 16), ("LUK", "Luke", 24),
    ("JOH", "John", 21), ("ACT", "Acts", 28), ("ROM", "Romans", 16),
    ("1CO", "1 Corinthians", 16), ("2CO", "2 Corinthians", 13), ("GAL", "Galatians", 6),
    ("EPH", "Ephesians", 6), ("PHI", "Philippians", 4), ("COL", "Colossians", 4),
    ("1TH", "1 Thessalonians", 5), ("2TH", "2 Thessalonians", 3), ("1TI", "1 Timothy", 6),
    ("2TI", "2 Timothy", 4), ("TIT", "Titus", 3), ("PHM", "Philemon", 1),
    ("HEB", "Hebrews", 13), ("JAM", "James", 5), ("1PE", "1 Peter", 5),
    ("2PE", "2 Peter", 3), ("1JO", "1 John", 5), ("2JO", "2 John", 1),
    ("3JO", "3 John", 1), ("JUD", "Jude", 1), ("REV", "Revelation", 22),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def write_edition(out: Path, snapshot: str, translation: str,
                  chapters: dict[str, dict[int, dict[str, str]]]) -> tuple[list[dict], dict]:
    books = []
    counts = {"books": 66, "chapters": 0, "versesWithText": 0, "emptyReferences": []}
    for i, (code, name, count) in enumerate(BOOKS):
        if set(chapters[code]) != set(range(1, count + 1)):
            raise ValueError(f"Incomplete chapter coverage for {translation} {code}")
        entries = []
        for number in range(1, count + 1):
            verses = chapters[code][number]
            if not verses:
                raise ValueError(f"Empty chapter: {translation} {code} {number}")
            body = encoded({"snapshot": snapshot, "translation": translation, "book": code, "chapter": number, "verses": verses})
            relative = f"{translation}/{code}-{number}.json"
            target = out / relative
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(body)
            available = [int(v) for v, wording in verses.items() if wording]
            entries.append({"number": number, "path": relative, "sha256": sha(body), "verses": available})
            counts["chapters"] += 1
            counts["versesWithText"] += len(available)
            counts["emptyReferences"].extend(f"{code} {number}:{v}" for v, wording in verses.items() if not wording)
        books.append({"id": code, "name": name, "testament": "OT" if i < 39 else "NT", "chapters": entries})
    return books, counts


KJV_URL = "https://ebible.org/Scriptures/eng-kjv_vpl.zip"
KJV_USFM_URL = "https://ebible.org/Scriptures/eng-kjv_usfm.zip"
KJV_RIGHTS = "https://www.cambridge.org/gb/universitypress/bibles/about/rights-and-permissions"


def clean_kjv(wording: str) -> str:
    """Drop pilcrow paragraph marks and the brackets that mark translators' supplied words."""
    return " ".join(wording.replace("\u00b6", " ").replace("[", "").replace("]", "").split())


def psalm_titles() -> tuple[dict[int, str], str]:
    """Psalm superscriptions are \\d headings in the USFM edition; the VPL merges them into verse 1."""
    usfm_archive = (INPUT / "eng-kjv_usfm.zip").read_bytes()
    with ZipFile(INPUT / "eng-kjv_usfm.zip") as zipped:
        usfm = zipped.read("20-PSAeng-kjv.usfm").decode("utf-8-sig")
    titles = {}
    for chapter in re.finditer(r"\\c (\d+)\s*\n((?:(?!\\v |\\c ).*\n)*)", usfm):
        heading = re.search(r"\\d (.*?)(?=\n\\(?:q|p|v|m|b)|\Z)", chapter.group(2), re.S)
        if heading:
            plain = re.sub(r"\\\+?[a-z0-9]+\*?", "", re.sub(r"\|[^\\]*", "", heading.group(1)))
            titles[int(chapter.group(1))] = " ".join(plain.split())
    return titles, sha(usfm_archive)


def build_kjv() -> dict:
    archive = (INPUT / "eng-kjv_vpl.zip").read_bytes()
    titles, usfm_sha = psalm_titles()
    with ZipFile(INPUT / "eng-kjv_vpl.zip") as zipped:
        text = zipped.read("eng-kjv_vpl.txt")
        about = zipped.read("eng-kjv_about.htm").decode("utf-8-sig")
    if "King James Version" not in about or "1769" not in about or "Public Domain" not in about:
        raise ValueError("The KJV archive does not identify the required edition/rights.")
    snapshot = "kjv1-" + sha(text)[:20]
    out = ROOT / "public" / "bibles" / snapshot
    out.mkdir(parents=True, exist_ok=True)
    codes = {code for code, _, _ in BOOKS}
    chapters: dict[str, dict[int, dict[str, str]]] = {code: {} for code in codes}
    pattern = re.compile(r"^(\S+) (\d+):(\d+) (.*)$")
    for line in text.decode("utf-8-sig").splitlines():
        match = pattern.match(line)
        if not match:
            raise ValueError(f"Unparsed source line: {line[:100]}")
        book, chapter, verse, wording = match.groups()
        if book not in codes:
            continue  # Apocrypha/Deuterocanon are not part of the shared 66-book canon.
        rows = chapters[book].setdefault(int(chapter), {})
        if verse in rows:
            raise ValueError(f"Duplicate source reference: {line[:80]}")
        rows[verse] = clean_kjv(wording)
    for number, title in titles.items():
        first = chapters["PSA"][number]["1"]
        if not first.startswith(title + " "):
            raise ValueError(f"Psalm {number} title does not open verse 1")
        # Printed KJV editions set the superscription above verse 1, as the USFM \\d marker records.
        chapters["PSA"][number]["1"] = first[len(title) + 1:]
    books, counts = write_edition(out, snapshot, "kjv", chapters)
    manifest = {"version": 1, "snapshot": snapshot, "translations": {"kjv": {
        "edition": "King James Version 1769 standardised text / " + snapshot,
        "source": KJV_URL, "sourceSha256": sha(text), "books": books,
    }}}
    body = encoded(manifest)
    (out / "manifest.json").write_bytes(body)
    return {
        "snapshot": snapshot, "manifestSha256": sha(body),
        "sources": {"url": KJV_URL, "archiveSha256": sha(archive), "kjv": sha(text),
                    "psalmTitlesUrl": KJV_USFM_URL, "psalmTitlesArchiveSha256": usfm_sha},
        "coverage": counts,
        "transformations": ("Pilcrow paragraph marks and square brackets around supplied words removed; "
                            f"{len(titles)} Psalm superscriptions (USFM \\d headings) moved out of verse 1; Apocrypha excluded."),
        "rights": "Public domain in most countries. In the United Kingdom, rights are vested in the Crown and administered by Cambridge University Press.",
        "rightsUrl": KJV_RIGHTS,
    }


def write_version(snapshot: str, manifest_sha: str, kjv: dict) -> None:
    (ROOT / "src" / "bible-version.ts").write_text(
        f"// Generated by tools/build_bible_catalog.py from the official text-only sources.\n"
        f"export const BIBLE_SNAPSHOT = '{snapshot}';\n"
        f"export const BIBLE_MANIFEST_SHA256 = '{manifest_sha}';\n"
        f"/** The KJV is a separate snapshot so existing WEB British/BSB saves keep their original keys. */\n"
        f"export const KJV_SNAPSHOT = '{kjv['snapshot']}';\n"
        f"export const KJV_MANIFEST_SHA256 = '{kjv['manifestSha256']}';\n", encoding="utf-8")


def kjv_only() -> None:
    """Add or refresh the KJV snapshot without touching the published WEB British/BSB snapshot."""
    receipt_path = ROOT / "sources" / "bible-catalog-receipt.json"
    report = json.loads(receipt_path.read_text(encoding="utf-8"))
    published = ROOT / "public" / "bibles" / report["snapshot"] / "manifest.json"
    if sha(published.read_bytes()) != report["manifestSha256"]:
        raise ValueError("The published WEB British/BSB snapshot does not match its receipt.")
    report["kjv"] = build_kjv()
    write_version(report["snapshot"], report["manifestSha256"], report["kjv"])
    receipt_path.write_bytes(encoded(report))
    print(json.dumps(report["kjv"], indent=2))


def main() -> None:
    archive = (INPUT / "eng-webbe_vpl.zip").read_bytes()
    bsb = (INPUT / "bsb.txt").read_bytes()
    with ZipFile(INPUT / "eng-webbe_vpl.zip") as zipped:
        web = zipped.read("eng-webbe_vpl.txt")
        about = zipped.read("eng-webbe_about.htm").decode("utf-8-sig")
    if "British Edition" not in about or "Public Domain" not in about:
        raise ValueError("The WEB archive does not identify the required edition/rights.")
    snapshot = "v1-" + sha(web + bsb)[:20]
    out = ROOT / "public" / "bibles" / snapshot
    out.mkdir(parents=True, exist_ok=True)
    digest = {"webbe": sha(web), "bsb": sha(bsb)}
    manifest = {"version": 1, "snapshot": snapshot, "translations": {}}
    sources = {
        "webbe": ("https://ebible.org/Scriptures/eng-webbe_vpl.zip", web.decode("utf-8-sig")),
        "bsb": ("https://bereanbible.com/bsb.txt", bsb.decode("utf-8-sig")),
    }
    coverage = {}
    for translation, (url, text) in sources.items():
        lookup = {(code if translation == "webbe" else name): code for code, name, _ in BOOKS}
        chapters: dict[str, dict[int, dict[str, str]]] = {code: {} for code, _, _ in BOOKS}
        pattern = re.compile(r"^(\S+) (\d+):(\d+) (.*)$" if translation == "webbe"
                             else r"^(.+) (\d+):(\d+)\t(.*)$")
        for line in text.splitlines():
            match = pattern.match(line)
            if not match:
                if translation == "bsb" and (line.startswith(("The Holy Bible", "This text", "Verse\t")) or not line.strip()):
                    continue
                raise ValueError(f"Unparsed source line: {line[:100]}")
            source_book, chapter, verse, wording = match.groups()
            if source_book not in lookup:
                if translation == "webbe":
                    continue  # This first catalogue deliberately covers the shared 66-book canon.
                raise ValueError(f"Unrecognised BSB book: {source_book}")
            book = lookup[source_book]
            rows = chapters[book].setdefault(int(chapter), {})
            if verse in rows:
                raise ValueError(f"Duplicate source reference: {line[:80]}")
            rows[verse] = wording.strip()
        books, counts = write_edition(out, snapshot, translation, chapters)
        manifest["translations"][translation] = {
            "edition": ("British 2020 stable VPL" if translation == "webbe" else "BSB official text") + " / " + snapshot,
            "source": url, "sourceSha256": digest[translation], "books": books,
        }
        coverage[translation] = counts
    # Independently captured curated official receipts are a wording regression gate.
    receipts = json.loads((ROOT / "sources" / "official-verses.json").read_text(encoding="utf-8"))
    refs = {"word-in-heart": ("PSA", 119, 11), "day-and-night": ("JOS", 1, 8), "peace-with-you": ("JOH", 14, 27)}
    for key, receipt in receipts.items():
        passage, translation, _ = key.split(":", 2)
        book, chapter, verse = refs[passage]
        data = json.loads((out / translation / f"{book}-{chapter}.json").read_bytes())
        if " ".join(data["verses"][str(verse)].split()) != receipt["text"]:
            raise ValueError(f"Official receipt mismatch: {key}")
    body = encoded(manifest)
    (out / "manifest.json").write_bytes(body)
    kjv = build_kjv()
    write_version(snapshot, sha(body), kjv)
    report = {
        "snapshot": snapshot, "scope": "66 shared Protestant-canon books, 39 OT and 27 NT; no deuterocanonical books",
        "sources": {"webbeArchiveSha256": sha(archive), **digest},
        "manifestSha256": sha(body), "coverage": coverage,
        "webbeRights": "https://ebible.org/eng-webbe/copyright.htm",
        "bsbRights": "https://berean.bible/terms.htm",
        "excluded": "Notes, headings, introductions, formatting, audio and other archive files are not shipped.",
        "kjv": kjv,
    }
    (ROOT / "sources" / "bible-catalog-receipt.json").write_bytes(encoded(report))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    # Upstream WEB downloads are revised over time; snapshots are immutable, so `--kjv-only`
    # adds the KJV snapshot while keeping the published v1 WEB British/BSB files byte-for-byte.
    kjv_only() if "--kjv-only" in sys.argv else main()
