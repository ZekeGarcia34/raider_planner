import json
import os
import re
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import requests

app = FastAPI()

if os.path.isdir("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

BASE_URL = "https://registration.texastech.edu/StudentRegistrationSsb/ssb"
TERM_CODE = "202727"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
}

CATALOG_CACHE = []


def parse_time(time_str):
    if not time_str or len(time_str) != 4:
        return "TBA"
    hours = int(time_str[:2])
    minutes = time_str[2:]
    period = "AM" if hours < 12 else "PM"
    if hours == 0:
        hours = 12
    elif hours > 12:
        hours -= 12
    return f"{hours}:{minutes} {period}"


def extract_calendar_courses(raw_course_list):
    formatted_courses = []
    for course in raw_course_list:
        crn = course.get("courseReferenceNumber")
        subject = course.get("subject")
        number = course.get("courseNumber")
        title = course.get("courseTitle")
        section = course.get("sequenceNumber")
        
        # --- FIX 1: Clamp negative seat counts to 0 ---
        raw_seats = course.get("seatsAvailable", 0)
        seats = max(0, raw_seats) if raw_seats is not None else 0

        faculty_list = course.get("faculty", [])
        instructor = (
            faculty_list[0].get("displayName") if faculty_list else "TBA"
        )

        meetings = []
        days_summary = []
        time_summary = "TBA"

        for meet_item in course.get("meetingsFaculty", []):
            time_info = meet_item.get("meetingTime", {})
            day_map = {
                "M": time_info.get("monday"),
                "T": time_info.get("tuesday"),
                "W": time_info.get("wednesday"),
                "R": time_info.get("thursday"),
                "F": time_info.get("friday"),
            }
            active_days = [day for day, active in day_map.items() if active]
            
            # --- FIX 2: Filter out exam slots/blank meeting lines with no active days ---
            meeting_type = time_info.get("meetingType")
            if not active_days and meeting_type != "CLAS":
                continue  # Skip unhighlighted exam/placeholder rows

            if active_days:
                days_summary.extend(
                    [d for d in active_days if d not in days_summary]
                )

            raw_start = time_info.get("beginTime")
            raw_end = time_info.get("endTime")
            if raw_start and raw_end:
                time_summary = (
                    f"{parse_time(raw_start)} - {parse_time(raw_end)}"
                )

            building = time_info.get("building") or ""
            room = time_info.get("room") or ""
            location = f"{building} {room}".strip() or "TBA"

            meetings.append(
                {
                    "days": active_days,
                    "start_time": parse_time(raw_start),
                    "end_time": parse_time(raw_end),
                    "location": location,
                    "meeting_type": time_info.get(
                        "meetingTypeDescription", "Lecture"
                    ),
                }
            )

        formatted_courses.append(
            {
                "crn": str(crn),
                "code": f"{subject} {number}",
                "dept": subject,
                "course_number": str(number),
                "section": section,
                "title": title,
                "instructor": instructor,
                "seats_available": seats,
                "days": "".join(days_summary) if days_summary else "TBA",
                "time": time_summary,
                "credits": course.get("creditHours", 3),
                "meetings": meetings,
            }
        )
    return formatted_courses


def fetch_ttu_banner_courses(
    subject="CS", course_num="", crn="", keyword="", page_size=500
):
    print(f"  [Scraper] Querying Banner for subject: {subject}...")
    session = requests.Session()
    try:
        session.post(
            f"{BASE_URL}/term/search?mode=search",
            params={"resetFiles": "true"},
            headers=HEADERS,
            timeout=4,
        )

        term_params = {"mode": "search", "term": TERM_CODE, "mepCode": "TTU"}
        term_resp = session.post(
            f"{BASE_URL}/term/search",
            params=term_params,
            headers=HEADERS,
            timeout=4,
        )

        if "fwdURL" not in term_resp.text:
            print("  [Scraper] Failed to lock term context in Banner.")
            return []

        search_params = {
            "txt_term": TERM_CODE,
            "txt_subject": subject,
            "txt_courseNumber": course_num,
            "txt_courseReferenceNumber": crn,
            "txt_keyword": keyword,
            "pageOffset": "0",
            "pageMaxSize": str(page_size),
            "sortColumn": "subjectDescription",
            "sortDirection": "asc",
            "mepCode": "TTU",
        }

        search_resp = session.get(
            f"{BASE_URL}/searchResults/searchResults",
            params=search_params,
            headers=HEADERS,
            timeout=6,
        )

        if search_resp.status_code == 200:
            raw_courses = search_resp.json().get("data") or []
            print(
                f"  [Scraper] Successfully fetched {len(raw_courses)} courses for {subject}!"
            )
            return extract_calendar_courses(raw_courses)
        else:
            print(
                f"  [Scraper] Search HTTP Error: {search_resp.status_code}"
            )
    except Exception as e:
        print(f"  [Scraper] Exception: {e}")
    return []


@app.on_event("startup")
def load_initial_catalog():
    global CATALOG_CACHE
    print("🚀 Pre-loading initial TTU courses...")
    # --- FIX 3: Fetch up to 500 sections instead of 50 ---
    for dept in ["CS", "MATH"]:
        courses = fetch_ttu_banner_courses(subject=dept, page_size=500)
        CATALOG_CACHE.extend(courses)
    print(
        f"✅ Loaded {len(CATALOG_CACHE)} initial courses into memory. Server ready!"
    )


def serve_html(file_name: str):
    if not file_name.endswith(".html"):
        file_name += ".html"

    paths_to_check = [
        os.path.join("templates", file_name),
        file_name,
    ]
    for path in paths_to_check:
        if os.path.exists(path):
            return FileResponse(path)
    raise HTTPException(
        status_code=404, detail=f"Page or file '{file_name}' not found."
    )


# --- ROUTING ---
@app.get("/")
def get_home():
    return serve_html("index.html")


# --- BANNER FETCH HELPERS ---

def fetch_ttu_terms():
    session = requests.Session()
    try:
        session.post(
            f"{BASE_URL}/term/search?mode=search",
            data={"resetFiles": "true"},
            headers=HEADERS,
            timeout=4
        )
        resp = session.get(
            f"{BASE_URL}/classSearch/getTerms",
            params={"searchTerm": "", "offset": "1", "max": "500", "mepCode": "TTU"},
            headers=HEADERS,
            timeout=5
        )
        if resp.status_code == 200:
            return [{"code": t["code"], "description": t["description"]} for t in resp.json()]
    except Exception as e:
        print(f"  [Terms Error] {e}")
    return []


def fetch_ttu_subjects(term_code: str):
    session = requests.Session()
    try:
        session.post(
            f"{BASE_URL}/term/search?mode=search",
            data={"resetFiles": "true"},
            headers=HEADERS,
            timeout=4
        )
        session.post(
            f"{BASE_URL}/term/search",
            data={"mode": "search", "term": term_code, "mepCode": "TTU"},
            headers=HEADERS,
            timeout=4
        )
        resp = session.get(
            f"{BASE_URL}/classSearch/get_subject",
            params={"searchTerm": "", "term": term_code, "offset": "1", "max": "5000", "mepCode": "TTU"},
            headers=HEADERS,
            timeout=5
        )
        if resp.status_code == 200:
            return [{"code": s["code"], "description": s["description"]} for s in resp.json()]
    except Exception as e:
        print(f"  [Subjects Error] {e}")
    return []


@app.get("/api/search")
def api_search_courses(
    q: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    global CATALOG_CACHE
    results = CATALOG_CACHE

    cached_depts = {c["dept"] for c in CATALOG_CACHE}

    # 1. Check direct department dropdown filter
    if dept and dept != "ALL":
        if dept not in cached_depts:
            new_courses = fetch_ttu_banner_courses(subject=dept, page_size=500)
            CATALOG_CACHE.extend(new_courses)
            cached_depts.add(dept)
        results = [c for c in CATALOG_CACHE if c["dept"] == dept]

    # 2. Process query string `q`
    if q:
        query_str = q.lower().strip()
        q_normalized = re.sub(r"[\s\-]", "", query_str)
        
        # Check if query contains a specific 4-digit course number (e.g. 1382)
        course_num_match = re.search(r"\b(\d{4})\b", query_str)
        target_course_num = course_num_match.group(1) if course_num_match else None

        # Check for subject code in string
        subject_match = re.search(r"\b([a-zA-Z]{2,4})\b", query_str) or re.search(
            r"^([a-zA-Z]{2,4})", q_normalized
        )
        if subject_match:
            detected_dept = subject_match.group(1).upper()
            if detected_dept not in cached_depts and len(detected_dept) >= 2:
                new_courses = fetch_ttu_banner_courses(
                    subject=detected_dept, page_size=500
                )
                if new_courses:
                    CATALOG_CACHE.extend(new_courses)
                    cached_depts.add(detected_dept)

        target_pool = results if (dept and dept != "ALL") else CATALOG_CACHE

        filtered = []
        for c in target_pool:
            # --- FIX 4: If user searched a 4-digit course number, match strictly ---
            if target_course_num and c.get("course_number") != target_course_num:
                continue

            code_normalized = re.sub(r"[\s\-]", "", c["code"].lower())

            if (
                q_normalized in code_normalized
                or query_str in c["code"].lower()
                or query_str in c["title"].lower()
                or query_str in c["instructor"].lower()
                or query_str in c["crn"]
            ):
                filtered.append(c)
        results = filtered

    total_count = len(results)

    start = (page - 1) * limit
    end = start + limit
    paginated_results = results[start:end]

    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": (total_count + limit - 1) // limit if limit else 1,
        "courses": paginated_results,
    }


# Catch-all route for any sub-pages
@app.get("/{page_name}")
def get_any_page(page_name: str):
    return serve_html(page_name)


# --- API ENDPOINTS FOR TERMS & SUBJECTS ---

@app.get("/api/terms")
def api_get_terms():
    terms = fetch_ttu_terms()
    return {"terms": terms}


@app.get("/api/subjects")
def api_get_subjects(term: str = Query(...)):
    subjects = fetch_ttu_subjects(term)
    return {"term": term, "subjects": subjects}