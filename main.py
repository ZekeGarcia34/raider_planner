import json
import os
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Mount static files (CSS, JS, images)
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Load scraped courses from JSON (falls back to empty list if courses.json doesn't exist yet)
COURSE_CATALOG = []
if os.path.exists("courses.json"):
    with open("courses.json", "r", encoding="utf-8") as f:
        COURSE_CATALOG = json.load(f)
        print(f"✅ Loaded {len(COURSE_CATALOG)} courses from courses.json")


def serve_html(file_name: str):
    """Helper function to find and return HTML pages."""
    templates_path = os.path.join("templates", file_name)
    if os.path.exists(templates_path):
        return FileResponse(templates_path)
    elif os.path.exists(file_name):
        return FileResponse(file_name)
    else:
        raise HTTPException(
            status_code=404, detail=f"File {file_name} not found"
        )


# ==============================================================================
# HTML PAGE ROUTES
# ==============================================================================
@app.get("/")
def read_root():
    return serve_html("index.html")


@app.get("/search")
def read_search():
    return serve_html("search.html")


@app.get("/social")
def read_social():
    return serve_html("social.html")


@app.get("/plans")
def read_plans():
    return serve_html("plans.html")


@app.get("/degree-map")
def read_degree_map():
    return serve_html("degree-map.html")


# ==============================================================================
# API ENDPOINT FOR CATALOG SEARCH
# ==============================================================================
@app.get("/api/search")
def search_courses(
    q: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    core: Optional[str] = Query(None),
):
    results = COURSE_CATALOG

    if q:
        query_str = q.lower().strip()
        results = [
            c
            for c in results
            if query_str in c.get("code", "").lower()
            or query_str in c.get("title", "").lower()
            or query_str in c.get("instructor", "").lower()
            or query_str in str(c.get("crn", ""))
        ]

    if dept and dept != "ALL":
        results = [c for c in results if c.get("dept") == dept]

    if core and core != "ALL":
        results = [c for c in results if c.get("core") == core]

    return {"count": len(results), "courses": results}