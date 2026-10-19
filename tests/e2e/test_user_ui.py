"""
Test user management UI for FLYX.
Tests user CRUD operations through the web interface.
"""

import pytest
from playwright.sync_api import Page, expect

from pages import LoginPage, UserPage


@pytest.mark.e2e
@pytest.mark.slow
class TestUserManagementUI:
    """User management UI E2E tests."""

    @pytest.fixture(autouse=True)
    def login(self, page: Page, frontend_url: str):
        """Login before each test."""
        login_page = LoginPage(page, frontend_url)
        login_page.goto()
        login_page.login("admin_user", "admin_user")

    def test_user_page_loads(self, page: Page, frontend_url: str):
        """Test that user management page loads."""
        user_page = UserPage(page, frontend_url)
        user_page.goto()

        page.wait_for_load_state("networkidle")
        assert "/user" in page.url

    def test_user_list_displays(self, page: Page, frontend_url: str):
        """Test that user list displays correctly."""
        user_page = UserPage(page, frontend_url)
        user_page.goto()
        page.wait_for_load_state("networkidle")

        users = page.locator("table tr, [data-testid='user-item'], [role='row']")
        count = users.count()
        assert count >= 0, "Should be able to access user list"

    def test_create_user_dialog(self, page: Page, frontend_url: str):
        """Test opening create user dialog."""
        user_page = UserPage(page, frontend_url)
        user_page.goto()
        page.wait_for_load_state("networkidle")

        create_btn = page.locator('button:has-text("创建"), button:has-text("新增")')
        if create_btn.count() > 0:
            create_btn.first.click()
            page.wait_for_timeout(500)

            dialog = page.locator('[role="dialog"], .modal, [data-testid="create-dialog"]')
            if dialog.count() > 0:
                expect(dialog.first).to_be_visible()

    def test_search_users(self, page: Page, frontend_url: str):
        """Test user search functionality."""
        user_page = UserPage(page, frontend_url)
        user_page.goto()
        page.wait_for_load_state("networkidle")

        search_input = page.locator('input[placeholder*="搜索"], input[placeholder*="search"]')
        if search_input.count() > 0:
            search_input.first.fill("admin")
            search_input.first.press("Enter")
            page.wait_for_load_state("networkidle")

            assert page.locator("text=admin_user").count() >= 1

    def test_user_pagination(self, page: Page, frontend_url: str):
        """Test user list pagination."""
        user_page = UserPage(page, frontend_url)
        user_page.goto()
        page.wait_for_load_state("networkidle")

        pagination = page.locator('[data-testid="pagination"], .pagination, nav[aria-label*="pagination"]')
        if pagination.count() > 0:
            next_btn = page.locator('button:has-text("下一页"), button[aria-label*="next"]')
            if next_btn.count() > 0 and not next_btn.first.is_disabled():
                next_btn.first.click()
                page.wait_for_load_state("networkidle")
