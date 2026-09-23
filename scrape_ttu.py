import json
import requests

BASE_URL = "https://registration.texastech.edu/StudentRegistrationSsb/ssb"
# Try '202608' (Fall 2026), '202605' (Summer 2026), or '202508' (Fall 2025)
TARGET_TERM = "202608"

def fetch_ttu_catalog(term: str = TARGET_TERM, subject: str = "CS"):
    session = requests.Session()

    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
    })

    print(f"1. Initializing session state for Term: {term}...")

    # Step A: Load main class search entry page to establish JSESSIONID
    session.get(f"{BASE_URL}/term/termSelection?mode=search")

    # Step B: Reset search data context (Banner internal cleanup)
    session.post(f"{BASE_URL}/classSearch/resetDataForm")

    # Step C: Select search mode
    session.get(f"{BASE_URL}/term/termSelection?mode=search")

    # Step D: Submit term selection POST payload
    post_headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": f"{BASE_URL}/term/termSelection?mode=search",
    }
    
    payload = {
        "term": term,
        "studyPath": "",
        "studyPathText": "",
        "startDatepicker": "",
        "endDatepicker": ""
    }

    term_resp = session.post(
        f"{BASE_URL}/term/search?mode=search",
        data=payload,
        headers=post_headers
    )

    if term_resp.status_code != 200:
        print(f"❌ Session setup failed with HTTP {term_resp.status_code}.")
        print("Retrying with term code '202605' (Summer/Spring) or '202508'...")
        return False

    print("2. Handshake successful! Fetching course catalog data...")

    # Step E: Query class search results endpoint
    params = {
        "txt_subject": subject,
        "txt_term": term,
        "pageOffset": 0,
        "pageMaxSize": 200,
        "sortColumn": "subjectDescription",
        "sortDirection": "asc"
    }

    search_headers = {
        "Referer": f"{BASE_URL}/classSearch/classSearch",
    }

    results_resp = session.get(
        f"{BASE_URL}/searchResults/searchResults",
        params=params,
        headers=search_headers
    )

    if results_resp.status_code != 200:
        print(f"❌ Search request failed with Status Code: {results_resp.status_code}")
        return False

    try:
        data = results_resp.json()
    except Exception as e:
        print(f"❌ Failed to parse response JSON: {e}")
        return False

    total = data.get("totalCount", 0)
    print(f"✓ Found {total} course sections for department: {subject}")

    parsed_courses = []
    for item in data.get("data", []):
        meetings = item.get("meetingsFaculty", [])
        days_str, time_str, instructor_str = "TBA", "TBA", "Staff"

        if meetings:
            m = meetings[0].get("meetingTime", {})
            fac = meetings[0].get("faculty", [])
            if fac:
                instructor_str = fac[0].get("displayName", "Staff")

            days = [
                char for day, char in [
                    ("monday", "M"), ("tuesday", "T"), ("wednesday", "W"),
                    ("thursday", "R"), ("friday", "F")
                ] if m.get(day)
            ]
            days_str = "".join(days) if days else "TBA"

            if m.get("beginTime") and m.get("endTime"):
                time_str = f"{m['beginTime']} - {m['endTime']}"

        parsed_courses.append({
            "crn": str(item.get("courseReferenceNumber")),
            "code": f"{item.get('subject')} {item.get('courseNumber')}",
            "title": item.get("courseTitle"),
            "dept": item.get("subject"),
            "credits": item.get("creditHours", 3),
            "days": days_str,
            "time": time_str,
            "instructor": instructor_str,
            "core": item.get("attributeCategoryDescription", "None"),
            "description": f"Section {item.get('sequenceNumber', '001')} - {item.get('scheduleTypeDescription', 'Lecture')}"
        })

    with open("courses.json", "w", encoding="utf-8") as f:
        json.dump(parsed_courses, f, indent=2)

    print(f"✅ Successfully written {len(parsed_courses)} courses to 'courses.json'!")
    return True

if __name__ == "__main__":
    # Attempt TARGET_TERM first; fall back to 202605 or 202508 if term is not published
    for term_attempt in [TARGET_TERM, "202605", "202508"]:
        if fetch_ttu_catalog(term=term_attempt, subject="CS"):
            break