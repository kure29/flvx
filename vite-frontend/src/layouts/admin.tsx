import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { motion } from "framer-motion";
import { LogOut, UserRound } from "lucide-react";

import { Button } from "@/shadcn-bridge/heroui/button";
import { BrandLogo } from "@/components/brand-logo";
import { VersionFooter } from "@/components/version-footer";
import { getMonitorAccess } from "@/api";
import { safeLogout } from "@/utils/logout";
import { siteConfig } from "@/config/site";
import { useMobileBreakpoint } from "@/hooks/useMobileBreakpoint";
import { getAdminFlag } from "@/utils/session";
import { useHasMySubscriptions } from "@/hooks/use-has-my-subscriptions";

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  // Hidden for admins: the page lives under 中转 for them.
  userOnly?: boolean;
  adminLabel?: string;
  // Admin menu heading shown above this item.
  section?: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem("sidebar_collapsed") === "true",
  );
  const [isAdmin, setIsAdmin] = useState(() => getAdminFlag());
  const hasMySubs = useHasMySubscriptions(isAdmin);
  const [monitorAllowed, setMonitorAllowed] = useState<boolean | null>(null);
  const [monitorAccessReason, setMonitorAccessReason] = useState<string | null>(
    null,
  );
  const isMobile = useMobileBreakpoint();

  // 菜单项配置：管理员按 线路 / 分发 / 系统 分组（用户页含分组和限速），普通用户保持原样
  const menuItems: MenuItem[] = [
    {
      path: "/dashboard",
      label: "仪表",
      adminLabel: "概览",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
        </svg>
      ),
    },
    {
      path: "/forward",
      label: "规则",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            clipRule="evenodd"
            d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
            fillRule="evenodd"
          />
        </svg>
      ),
      userOnly: true,
    },
    {
      path: "/my-subscriptions",
      label: "订阅",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 3a1 1 0 000 2c5.523 0 10 4.477 10 10a1 1 0 102 0C17 8.373 11.627 3 5 3z" />
          <path d="M4 9a1 1 0 011-1 7 7 0 017 7 1 1 0 11-2 0 5 5 0 00-5-5 1 1 0 01-1-1zM3 15a2 2 0 114 0 2 2 0 01-4 0z" />
        </svg>
      ),
      // Shown once the user has subscriptions assigned.
      userOnly: true,
    },
    {
      path: "/node",
      section: "线路",
      label: "服务器",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            clipRule="evenodd"
            d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z"
            fillRule="evenodd"
          />
        </svg>
      ),
      adminOnly: true,
    },
    {
      path: "/inbound",
      label: "节点",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            clipRule="evenodd"
            d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
            fillRule="evenodd"
          />
        </svg>
      ),
      adminOnly: true,
    },
    {
      path: "/relay",
      label: "中转",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            clipRule="evenodd"
            d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
            fillRule="evenodd"
          />
        </svg>
      ),
      adminOnly: true,
    },
    {
      path: "/subscription",
      section: "分发",
      label: "订阅",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 3a1 1 0 000 2c5.523 0 10 4.477 10 10a1 1 0 102 0C17 8.373 11.627 3 5 3z" />
          <path d="M4 9a1 1 0 011-1 7 7 0 017 7 1 1 0 11-2 0 5 5 0 00-5-5 1 1 0 01-1-1zM3 15a2 2 0 114 0 2 2 0 01-4 0z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      path: "/user",
      label: "用户",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      path: "/monitor",
      // Admins find monitoring under 节点 and 中转.
      userOnly: true,
      section: "系统",
      label: "监控",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            clipRule="evenodd"
            d="M3 3a1 1 0 000 2v11a1 1 0 001 1h13a1 1 0 100-2H5V5a1 1 0 00-1-1H3zm13.707 4.293a1 1 0 00-1.414 0L12 10.586 10.707 9.293a1 1 0 00-1.414 0L7 11.586l-1.293-1.293a1 1 0 10-1.414 1.414l2 2a1 1 0 001.414 0L10 11.414l1.293 1.293a1 1 0 001.414 0l3-3a1 1 0 000-1.414z"
            fillRule="evenodd"
          />
        </svg>
      ),
    },
    {
      path: "/panel-sharing",
      label: "共享",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      path: "/config",
      label: "设置",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            clipRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            fillRule="evenodd"
          />
        </svg>
      ),
      adminOnly: true,
    },
  ];

  useEffect(() => {
    // 获取用户信息
    const adminFlag = getAdminFlag();

    setIsAdmin(adminFlag);

    // Monitor permission is not strictly role-based; non-admin users may be
    // granted access explicitly. Fetch a lightweight capability flag so we can
    // avoid a confusing 403 navigation.
    if (adminFlag) {
      setMonitorAllowed(true);
      setMonitorAccessReason(null);

      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await getMonitorAccess();

        if (cancelled) return;
        if (res.code === 0 && res.data) {
          setMonitorAllowed(Boolean(res.data.allowed));
          setMonitorAccessReason(
            res.data.allowed ? null : res.data.reason || null,
          );

          return;
        }
        // Fail open to preserve legacy navigation behavior.
        setMonitorAllowed(true);
        setMonitorAccessReason(null);
      } catch {
        if (cancelled) return;
        setMonitorAllowed(true);
        setMonitorAccessReason(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuVisible(false);
    }
  }, [isMobile]);

  // The layout now stays mounted across pages: start each page at the top
  // and with the mobile menu closed, as a fresh layout did.
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    setMobileMenuVisible(false);
  }, [location.pathname]);

  // 退出登录
  const handleLogout = () => {
    safeLogout();
  };

  // 切换移动端菜单
  const toggleMobileMenu = () => {
    setMobileMenuVisible(!mobileMenuVisible);
  };

  // 隐藏移动端菜单
  const hideMobileMenu = () => {
    setMobileMenuVisible(false);
  };

  // 切换折叠状态
  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed;

    setIsCollapsed(newCollapsed);
    localStorage.setItem("sidebar_collapsed", newCollapsed.toString());
  };

  // 菜单点击处理
  const handleMenuClick = (path: string) => {
    if (path === "/monitor" && monitorAllowed !== true) {
      if (monitorAllowed == null) {
        toast("正在检查监控权限，请稍后重试");

        return;
      }

      const hint =
        monitorAccessReason === "need_admin_grant"
          ? "暂无监控权限，请联系管理员在用户页面授予监控权限"
          : "暂无监控权限，请联系管理员授权";

      toast.error(hint);

      return;
    }

    navigate(path);
    if (isMobile) {
      hideMobileMenu();
    }
  };

  // 过滤菜单项（根据权限）
  const filteredMenuItems = menuItems
    .filter((item) => (isAdmin ? !item.userOnly : !item.adminOnly))
    .filter((item) => item.path !== "/my-subscriptions" || hasMySubs)
    .map((item) =>
      isAdmin && item.adminLabel ? { ...item, label: item.adminLabel } : item,
    );

  return (
    <div
      className={`flex ${isMobile ? "min-h-screen p-0" : "h-screen p-6 gap-6 [@media(max-height:760px)]:p-4 [@media(max-height:760px)]:gap-4"} bg-mesh-gradient overflow-hidden`}
    >
      {/* 移动端遮罩层 */}
      {isMobile && mobileMenuVisible && (
        <button
          aria-label="关闭菜单"
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          type="button"
          onClick={hideMobileMenu}
        />
      )}

      {/* 左侧菜单栏 */}
      <aside
        className={`
        ${isMobile ? "fixed h-screen top-0 left-0 rounded-r-3xl" : "relative h-full rounded-3xl"}
        ${isMobile && !mobileMenuVisible ? "-translate-x-full" : "translate-x-0"}
        ${isMobile ? "w-64" : isCollapsed ? "w-20" : "w-[260px]"}
        bg-white/70 dark:bg-zinc-900/70 backdrop-blur-3xl
        shadow-[0_10px_30px_rgba(0,0,0,0.1)]
        border border-white/80 dark:border-white/10
        z-50
        transition-all duration-300 ease-in-out
        flex flex-col flex-shrink-0      `}
      >
        {/* Logo 区域 */}
        <div className="px-6 py-6 [@media(max-height:760px)]:py-4 flex items-center overflow-hidden whitespace-nowrap box-border">
          <BrandLogo className="h-10 w-10 flex-shrink-0 rounded-xl" size={40} />
          <div
            className={`transition-all duration-300 overflow-hidden ${isCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[180px] opacity-100 ml-3"}`}
          >
            <h1 className="text-xl font-bold text-foreground overflow-hidden whitespace-nowrap text-ellipsis">
              {siteConfig.name}
            </h1>
          </div>
        </div>

        {/* 菜单导航 */}
        <nav className="flex-1 px-4 overflow-y-auto overflow-x-hidden scrollbar-hide">
          <ul className="space-y-1">
            {filteredMenuItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path === "/relay" &&
                  isAdmin &&
                  ["/tunnel", "/forward"].includes(location.pathname)) ||
                (item.path === "/user" &&
                  ["/group", "/limit"].includes(location.pathname));
              const isMonitor = item.path === "/monitor";
              const isMonitorBlocked = isMonitor && monitorAllowed !== true;

              return (
                <li key={item.path}>
                  {isAdmin &&
                    item.section &&
                    (isCollapsed ? (
                      <div className="mx-3 my-2 border-t border-default-200/70" />
                    ) : (
                      <div className="px-3 pb-1 pt-3 text-[11px] font-medium tracking-wide text-default-400 [@media(max-height:760px)]:pt-2">
                        {item.section}
                      </div>
                    ))}
                  <motion.button
                    aria-disabled={isMonitorBlocked}
                    className={`
                       w-full flex items-center px-3 py-2.5 rounded-2xl text-left
                       relative min-h-[44px] overflow-hidden transition-colors
                       [@media(max-height:760px)]:min-h-[38px] [@media(max-height:760px)]:py-2
                       ${isMonitorBlocked ? "opacity-60" : ""}
                       ${
                         isActive
                           ? "text-primary dark:text-primary-400 font-semibold"
                           : isMonitorBlocked
                             ? "text-gray-500 dark:text-gray-400 font-medium"
                             : "text-gray-600 dark:text-gray-300 font-medium"
                       }
                     `}
                    title={
                      isCollapsed
                        ? isMonitorBlocked
                          ? `${item.label} (无权限)`
                          : item.label
                        : undefined
                    }
                    transition={{ duration: 0.15 }}
                    onClick={() => handleMenuClick(item.path)}
                  >
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl bg-white/60 dark:bg-white/10 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.18)] border border-white dark:border-white/20"
                        layoutId="sidebar-active"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    )}
                    {!isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl bg-white/40 dark:bg-white/5 opacity-0"
                        transition={{ duration: 0.15 }}
                        whileHover={{ opacity: 1 }}
                      />
                    )}
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center relative z-10">
                      {item.icon}
                    </div>
                    <div
                      className={`transition-all duration-300 overflow-hidden flex items-center ${isCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[200px] opacity-100 ml-3"}`}
                    >
                      <span className="relative z-10 whitespace-nowrap">
                        {item.label}
                      </span>
                    </div>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 底部账号操作、版权信息和折叠按钮 */}
        <div className="px-5 py-4 [@media(max-height:760px)]:py-3 [@media(max-height:760px)]:gap-2 mt-auto flex-shrink-0 flex flex-col gap-3 overflow-hidden whitespace-nowrap box-border">
          {!isMobile && (
            <div className="flex flex-col gap-1">
              {[
                // Password, passkeys and GitHub live on the account page.
                {
                  key: "account",
                  label: "账户与登录",
                  icon: UserRound,
                  onPress: () => navigate("/profile"),
                },
                {
                  key: "logout",
                  label: "退出登录",
                  icon: LogOut,
                  onPress: handleLogout,
                },
              ].map((a) => (
                <button
                  key={a.key}
                  className={`flex h-9 [@media(max-height:760px)]:h-8 items-center rounded-xl text-sm text-default-500 transition-colors hover:bg-default-100 hover:text-foreground ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"}`}
                  title={a.label}
                  type="button"
                  onClick={a.onPress}
                >
                  <a.icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>{a.label}</span>}
                </button>
              ))}
            </div>
          )}
          {/* Version and the collapse button share a row so short
              laptop screens still fit the whole menu. */}
          <div
            className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between gap-2"}`}
          >
            <div
              className={`min-w-0 transition-all duration-300 overflow-hidden flex items-center ${isCollapsed ? "max-w-0 opacity-0 hidden" : "max-w-[200px] opacity-100"}`}
            >
              <VersionFooter
                poweredClassName="text-xs text-gray-400 dark:text-gray-500"
                updateBadgeClassName="ml-2 inline-flex items-center rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white"
                version={siteConfig.version}
                versionClassName="text-xs text-gray-400 dark:text-gray-500"
              />
            </div>

            {/* 桌面端折叠按钮 */}
            {!isMobile && (
              <Button
                isIconOnly
                className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 min-w-0 w-9 h-9 rounded-full"
                size="sm"
                variant="light"
                onPress={toggleCollapse}
              >
                {isCollapsed ? (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M13 5l7 7-7 7M5 5l7 7-7 7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                )}
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* 主内容区域 */}
      <div
        className={`flex flex-col flex-1 ${isMobile ? "min-h-0" : "h-full overflow-hidden"} relative`}
      >
        {/* 移动端菜单按钮 (替代Header) */}
        {isMobile && (
          <Button
            isIconOnly
            className="absolute top-4 left-4 z-40 bg-white/20 dark:bg-zinc-900/20 backdrop-blur-md shadow-sm border border-white/80 dark:border-white/10"
            variant="flat"
            onPress={toggleMobileMenu}
          >
            <svg
              className="w-5 h-5 text-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 6h16M4 12h16M4 18h16"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </Button>
        )}

        {/* 主内容 */}
        <main ref={mainRef} className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Enter animation only: an exit animation would hold the next
              page back until the old one is gone. */}
          <motion.div
            key={location.pathname}
            animate={{ opacity: 1, y: 0 }}
            className="h-full"
            initial={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
