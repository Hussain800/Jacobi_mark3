"""Boot smoke tests — importing the app and its module graph must not raise.

This is the cheapest guard against the class of failure that took the Render
backend down on 2026-06-04: a runtime dependency (numpy, via
main -> math_engine -> pricing_engine) that was missing from requirements.txt.
If `import main` fails, `uvicorn main:app` can't start.

Run under a CLEAN `pip install -r requirements.txt` (see the backend-ci
workflow) to also catch deps that are missing from requirements but happen to
be installed in a dev environment.
"""


def test_import_main_app():
    import main
    assert main.app is not None
    assert main.app.title


def test_import_math_layer():
    import math_engine
    import pricing_engine  # noqa: F401  (imported for its side-effect of loading)
    assert hasattr(math_engine, "apply_math_engine_v2")
    # The wired entrypoint must be callable and fail-soft on an empty session.
    assert main_apply_is_callable()


def main_apply_is_callable() -> bool:
    import main
    try:
        main.apply_math_engine_v2({"all_prices": {}, "gradients": [], "coverage": "limited", "agents": []})
        return True
    except Exception:
        return False


def test_import_report_export():
    import report_export
    assert hasattr(report_export, "export_pdf")
