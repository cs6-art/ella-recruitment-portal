"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import UiIcon from "./UiIcon";
import { ConfirmationProvider } from "./ConfirmationModal";
import styles from "./AppShell.module.css";

type AppShellUser = {
  name?: string;
  email?: string;
  accessRole?: string;
  department?: string;
  canCreateRole?: boolean;
  canReviewRole?: boolean;
  canApproveRole?: boolean;
  canEditSettings?: boolean;
  canManageUsers?: boolean;
  active?: boolean;
};

type AppShellProps = { user: AppShellUser; children: React.ReactNode };
const SIDEBAR_COLLAPSED_STORAGE_KEY = "mclink.sidebar.collapsed";

function getInitials(name?: string, email?: string) {
  const source = name?.trim() || email?.trim() || "User";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceLoaded, setSidebarPreferenceLoaded] = useState(false);
  const userName = user.name?.trim() || "McLink User";
  const userEmail = user.email?.trim() || "";
  const initials = getInitials(userName, userEmail);
  const showRoleRequests = user.canReviewRole === true || user.canApproveRole === true || user.canCreateRole === true;
  const isDashboard = pathname === "/dashboard";
  const isRoleList = pathname === "/roles";
  const isRoleCreate = pathname === "/roles/new";
  const isRoleDetails = pathname.startsWith("/roles/") && pathname !== "/roles/new";
  // Role-specific applicant pages live under /roles/.../applicants. Keep them
  // under Role Requests so the sidebar never highlights two sections at once.
  const isApplicants = pathname === "/applicants" || pathname.startsWith("/applicants/");
  const isApplicantDetail = pathname.startsWith("/applicants/");
  const isResumeScreening = pathname === "/resume-screening";
  const isBookings = pathname === "/bookings" || pathname.startsWith("/bookings/");
  const isProfile = pathname === "/profile";
  const isSettings = pathname === "/settings";
  const isUserAccounts = pathname === "/user-accounts";
  const isRoleRequestArea = pathname === "/roles" || (pathname.startsWith("/roles/") && pathname !== "/roles/new");
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    const savedPreference = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (savedPreference === "true") setSidebarCollapsed(true);
    if (savedPreference === "true") document.documentElement.dataset.sidebarCollapsed = "true";
    setSidebarPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!sidebarPreferenceLoaded) return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    if (sidebarCollapsed) document.documentElement.dataset.sidebarCollapsed = "true";
    else delete document.documentElement.dataset.sidebarCollapsed;
  }, [sidebarCollapsed, sidebarPreferenceLoaded]);

  return (
    <ConfirmationProvider>
    <div className={styles.shell}>
      <div className={`${styles.backdrop} ${sidebarOpen ? styles.backdropVisible : ""}`} onClick={closeSidebar} aria-hidden="true" />
      <aside id="portal-navigation" className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`} aria-label="Portal navigation">
        <div className={styles.sidebarTop}>
          <Link href="/dashboard" className={styles.brand} onClick={closeSidebar}>
            <span className={styles.brandIcon}>M</span><span><strong>McLink</strong><small>Recruitment Portal</small></span>
          </Link>
          <button type="button" className={styles.closeButton} onClick={closeSidebar} aria-label="Close navigation"><UiIcon name="close" /></button>
        </div>

        <div className={styles.workspaceLabel}>WORKSPACE</div>
        <nav className={styles.navigation} aria-label="Main navigation">
          <Link href="/dashboard" onClick={closeSidebar} className={`${styles.navLink} ${isDashboard ? styles.navLinkActive : ""}`}><span className={styles.navIcon}><UiIcon name="dashboard" /></span><span>Dashboard</span></Link>
          {showRoleRequests && <Link href="/roles" onClick={closeSidebar} className={`${styles.navLink} ${isRoleList || isRoleDetails || isRoleCreate ? styles.navLinkActive : ""}`}><span className={styles.navIcon}><UiIcon name="roles" /></span><span>Role Requests</span></Link>}
          {showRoleRequests && <Link href="/resume-screening" onClick={closeSidebar} className={`${styles.navLink} ${isResumeScreening ? styles.navLinkActive : ""}`}><span className={styles.navIcon}><UiIcon name="document" /></span><span>Resume Screening</span></Link>}
          {showRoleRequests && <div className={styles.applicantBookingGroup}>
            <Link href="/applicants" onClick={closeSidebar} className={`${styles.navLink} ${isApplicants ? styles.navLinkActive : ""}`}><span className={styles.navIcon}><UiIcon name="applicants" /></span><span>Applicants</span></Link>
            <button type="button" className={styles.collapseButton} onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!sidebarCollapsed}><UiIcon name={sidebarCollapsed ? "chevron-right" : "chevron-left"} /></button>
            <Link href="/bookings" onClick={closeSidebar} className={`${styles.navLink} ${isBookings ? styles.navLinkActive : ""}`}><span className={styles.navIcon}><UiIcon name="calendar" /></span><span>Bookings</span></Link>
          </div>}
          {user.canEditSettings === true && <Link href="/settings" onClick={closeSidebar} className={`${styles.navLink} ${isSettings ? styles.navLinkActive : ""}`}><span className={styles.navIcon}><UiIcon name="settings" /></span><span>Settings</span></Link>}
          {(user.canManageUsers === true || user.canEditSettings === true) && <Link href="/user-accounts" onClick={closeSidebar} className={`${styles.navLink} ${isUserAccounts ? styles.navLinkActive : ""}`}><span className={styles.navIcon}><UiIcon name="users" /></span><span>User Accounts</span></Link>}
        </nav>

        <div className={styles.sidebarSpacer} />
        <div className={styles.accountSection}>
          <div className={styles.workspaceLabel}>ACCOUNT</div>
          <Link href="/profile" onClick={closeSidebar} className={`${styles.profileButton} ${isProfile ? styles.profileButtonActive : ""}`}><div className={styles.avatar}>{initials}</div><div className={styles.profileDetails}><strong>{userName}</strong>{userEmail && <span>{userEmail}</span>}{user.accessRole && <small>{user.accessRole}</small>}</div><span className={styles.profileArrow}><UiIcon name="chevron-right" /></span></Link>
          <form action="/api/auth/logout" method="get"><button type="submit" className={styles.signOutButton} onClick={() => setSigningOut(true)} disabled={signingOut}><UiIcon name="logout" /><span className={styles.signOutText}>{signingOut ? "Signing out..." : "Sign Out"}</span></button></form>
        </div>
      </aside>

      <div className={`${styles.main} ${sidebarCollapsed ? styles.mainCollapsed : ""}`}>
        <header className={styles.mobileHeader}><Link href="/dashboard" className={styles.mobileBrand} onClick={closeSidebar}><span className={styles.brandIcon}>M</span><strong>McLink Recruitment Portal</strong></Link><button type="button" className={styles.menuButton} onClick={() => setSidebarOpen(true)} aria-expanded={sidebarOpen} aria-controls="portal-navigation"><UiIcon name="menu" /><span>Menu</span></button></header>
        {!isDashboard && !isRoleRequestArea && !isApplicantDetail && <div className={styles.pageToolbar}><Link href="/dashboard" className="portal-back-button" aria-label="Back to Dashboard"><UiIcon name="arrow-left" />Back to Dashboard</Link></div>}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
    </ConfirmationProvider>
  );
}
