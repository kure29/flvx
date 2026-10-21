import { useLocation, useNavigate } from "react-router-dom";

import { AnimatedPage } from "@/components/animated-page";
import { PageHeader, PageTabs } from "@/components/page-kit";
import GroupPage from "@/pages/group";
import LimitPage from "@/pages/limit";
import UserPage from "@/pages/user";

// Each tab keeps its own address, so old links and the back button still
// land on the right one.
const TABS = [
  { key: "/user", label: "用户" },
  { key: "/group", label: "分组" },
  { key: "/limit", label: "限速" },
];

const HELP: Record<string, string> = {
  "/user": "面板账号，分配隧道权限、流量和到期时间",
  "/group": "把隧道和用户编组，再按组授予隧道使用权限",
  "/limit": "分配隧道权限时可选的带宽上限",
};

/** Users with the groups and speed limits used when granting them tunnels. */
export default function UserHubPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = TABS.some((t) => t.key === location.pathname)
    ? location.pathname
    : "/user";

  return (
    <AnimatedPage className="px-3 py-6 lg:px-6">
      <PageHeader description={HELP[tab]} title="用户" />
      <PageTabs
        tabs={TABS}
        value={tab}
        onChange={(key) => navigate(key, { replace: true })}
      />
      {tab === "/group" ? (
        <GroupPage embedded />
      ) : tab === "/limit" ? (
        <LimitPage embedded />
      ) : (
        <UserPage embedded />
      )}
    </AnimatedPage>
  );
}
