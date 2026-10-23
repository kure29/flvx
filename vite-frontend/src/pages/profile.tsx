import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  CircleCheck,
  Fingerprint,
  Github,
  KeyRound,
  LogOut,
  Settings,
  Share2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/shadcn-bridge/heroui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@/shadcn-bridge/heroui/modal";
import { Input } from "@/shadcn-bridge/heroui/input";
import { isWebViewFunc } from "@/utils/panel";
import { siteConfig } from "@/config/site";
import { VersionFooter } from "@/components/version-footer";
import {
  getGithubInfo,
  getPasskeyStatus,
  listPasskeys,
  updatePassword,
  type GithubInfo,
  type PasskeyItem,
} from "@/api";
import { safeLogout } from "@/utils/logout";
import { getAdminFlag, getSessionName } from "@/utils/session";
import { PasskeyModal } from "@/components/passkey-manager";
import { GithubBindingModal } from "@/components/github-binding";
import { PageHeader } from "@/components/page-kit";
import { useH5Mode } from "@/hooks/useH5Mode";

interface PasswordForm {
  newUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

type Tone = "primary" | "success" | "warning" | "secondary" | "danger";

const TONE: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  secondary: "bg-secondary/10 text-secondary",
  danger: "bg-danger/10 text-danger",
};

function IconTile({
  icon: Icon,
  tone,
  size = "md",
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${TONE[tone]} ${size === "lg" ? "h-11 w-11" : "h-8 w-8"}`}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  );
}

interface SecurityItem {
  key: string;
  label: string;
  description: string;
  /** The current state, e.g. "已绑定 kure29". */
  status: string;
  /** Whether the status is a good one (bound, set up). */
  active?: boolean;
  /** The desktop button. */
  action: string;
  icon: LucideIcon;
  tone: Tone;
  onPress: () => void;
}

interface ShortcutItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
  onPress: () => void;
}

function Avatar({ name, large }: { name: string; large?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary font-semibold text-white shadow-sm ${large ? "h-16 w-16 text-2xl" : "h-12 w-12 text-lg"}`}
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function RoleChip({ isAdmin }: { isAdmin: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isAdmin ? "bg-primary/10 text-primary" : "bg-default-100 text-default-600"}`}
    >
      {isAdmin && <ShieldCheck className="h-3 w-3" />}
      {isAdmin ? "管理员" : "普通用户"}
    </span>
  );
}

/** Phone: iOS-settings style rows, the status on the right. */
function SecurityList({ items }: { items: SecurityItem[] }) {
  return (
    <div className="divide-y divide-divider overflow-hidden rounded-2xl bg-content1 shadow-sm">
      {items.map((item) => (
        <button
          key={item.key}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-default-100"
          type="button"
          onClick={item.onPress}
        >
          <IconTile icon={item.icon} tone={item.tone} />
          <span className="min-w-0 flex-1 truncate text-[15px]">
            {item.label}
          </span>
          <span
            className={`max-w-[45%] truncate text-sm ${item.active ? "text-default-600" : "text-default-400"}`}
          >
            {item.status}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-default-300" />
        </button>
      ))}
    </div>
  );
}

/** Desktop: one row per method with what it is, its state and a button. */
function SecurityPanel({ items }: { items: SecurityItem[] }) {
  return (
    <section className="rounded-2xl border border-divider bg-content1 shadow-sm">
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-base font-semibold">登录与安全</h2>
        <p className="mt-0.5 text-sm text-default-500">
          管理登录这个面板的方式。绑定、解绑和修改都需要当前密码
        </p>
      </div>
      <div className="divide-y divide-divider">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-4 px-6 py-4">
            <IconTile icon={item.icon} size="lg" tone={item.tone} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.label}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${item.active ? "bg-success/10 text-success" : "bg-default-100 text-default-500"}`}
                >
                  {item.active && <CircleCheck className="h-3 w-3" />}
                  {item.status}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-default-500">
                {item.description}
              </p>
            </div>
            <Button
              className="min-w-16"
              size="sm"
              variant="bordered"
              onPress={item.onPress}
            >
              {item.action}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The login rows (passkey, GitHub) only show once their status loads, so
 * the page jumped as they popped in. The last status is remembered per
 * user in this browser and shown at once, then refreshed.
 */
interface LoginCache {
  passkeyEnabled: boolean;
  passkeyCount: number;
  github: GithubInfo | null;
}

const loginCacheKey = () => `flyx_login_rows_${getSessionName() || ""}`;

function readLoginCache(): LoginCache {
  try {
    const raw = JSON.parse(localStorage.getItem(loginCacheKey()) || "null");

    if (raw && typeof raw === "object") return raw as LoginCache;
  } catch {
    // ignore: the rows just load as before
  }

  return { passkeyEnabled: false, passkeyCount: 0, github: null };
}

function writeLoginCache(patch: Partial<LoginCache>) {
  try {
    localStorage.setItem(
      loginCacheKey(),
      JSON.stringify({ ...readLoginCache(), ...patch }),
    );
  } catch {
    // ignore
  }
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const isH5 = useH5Mode();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    newUsername: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [cached] = useState(readLoginCache);
  const [passkeyEnabled, setPasskeyEnabled] = useState(cached.passkeyEnabled);
  const [passkeys, setPasskeys] = useState<PasskeyItem[] | null>(null);
  const passkeyCount = passkeys?.length ?? cached.passkeyCount;
  const [github, setGithub] = useState<GithubInfo | null>(cached.github);
  const [openLogin, setOpenLogin] = useState<"passkey" | "github" | null>(null);
  // The app's WebView can't do passkeys or come back from GitHub.
  const webView = isWebViewFunc();

  const loadPasskeys = () =>
    listPasskeys()
      .then((res) => {
        if (res.code === 0) {
          setPasskeys(res.data || []);
          writeLoginCache({ passkeyCount: (res.data || []).length });
        }
      })
      .catch(() => setPasskeys([]));
  const loadGithub = () =>
    getGithubInfo()
      .then((res) => {
        if (res.code === 0) {
          setGithub(res.data);
          writeLoginCache({ github: res.data });
        }
      })
      .catch(() => setGithub(null));

  useEffect(() => {
    // 获取用户信息
    setUsername(getSessionName() || "Admin");
    setIsAdmin(getAdminFlag());
    void loadGithub();
    if (
      window.isSecureContext &&
      typeof window.PublicKeyCredential !== "undefined"
    ) {
      getPasskeyStatus()
        .then((res) => {
          if (res.code !== 0) return;
          setPasskeyEnabled(res.data.enabled);
          writeLoginCache({ passkeyEnabled: res.data.enabled });
          if (res.data.enabled) void loadPasskeys();
        })
        .catch(() => setPasskeyEnabled(false));
    }
  }, []);

  const go = (path: string) => () => navigate(path);

  // On phones the sidebar is gone; these are its admin pages.
  const shortcuts: ShortcutItem[] = [
    {
      key: "/user",
      label: "用户管理",
      description: "用户、分组和限速",
      icon: Users,
      tone: "primary",
      onPress: go("/user"),
    },
    {
      key: "/panel-sharing",
      label: "面板共享",
      description: "与其他面板联邦共享",
      icon: Share2,
      tone: "success",
      onPress: go("/panel-sharing"),
    },
    {
      key: "/config",
      label: "网站配置",
      description: "站点、登录与备份",
      icon: Settings,
      tone: "warning",
      onPress: go("/config"),
    },
  ];

  // 退出登录
  const handleLogout = () => {
    safeLogout();
  };

  // 密码表单验证
  const validatePasswordForm = (): boolean => {
    if (!passwordForm.newUsername.trim()) {
      toast.error("请输入新用户名");

      return false;
    }
    if (passwordForm.newUsername.length < 3) {
      toast.error("用户名长度至少3位");

      return false;
    }
    if (!passwordForm.currentPassword) {
      toast.error("请输入当前密码");

      return false;
    }
    if (!passwordForm.newPassword) {
      toast.error("请输入新密码");

      return false;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error("新密码长度不能少于6位");

      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("两次输入密码不一致");

      return false;
    }

    return true;
  };

  // 提交密码修改
  const handlePasswordSubmit = async () => {
    if (!validatePasswordForm()) return;

    setPasswordLoading(true);
    try {
      const response = await updatePassword(passwordForm);

      if (response.code === 0) {
        toast.success("密码修改成功，请重新登录");
        onOpenChange();
        handleLogout();
      } else {
        toast.error(response.msg || "密码修改失败");
      }
    } catch {
      toast.error("修改密码时发生错误");
    } finally {
      setPasswordLoading(false);
    }
  };

  // 重置密码表单
  const resetPasswordForm = () => {
    setPasswordForm({
      newUsername: "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const securityItems: SecurityItem[] = [
    {
      key: "password",
      label: "用户名与密码",
      description: "修改登录用的用户名和密码，改完需要重新登录",
      status: username,
      action: "修改",
      icon: KeyRound,
      tone: "primary",
      onPress: onOpen,
    },
    ...(passkeyEnabled && !webView
      ? [
          {
            key: "passkey",
            label: "通行证密钥",
            description: "用指纹、面容或设备密码登录，不用输入密码",
            status: passkeyCount > 0 ? `${passkeyCount} 个` : "未设置",
            active: passkeyCount > 0,
            action: "管理",
            icon: Fingerprint,
            tone: "success" as Tone,
            onPress: () => setOpenLogin("passkey"),
          },
        ]
      : []),
    // Shown once an admin turns GitHub login on, or while still bound so
    // the user can unbind.
    ...(github && !webView && (github.enabled || github.bound)
      ? [
          {
            key: "github",
            label: "GitHub 登录",
            description: "在登录页用 GitHub 账号一键登录",
            status: github.bound ? `已绑定 ${github.login}` : "未绑定",
            active: github.bound,
            action: github.bound ? "解绑" : "绑定",
            icon: Github,
            tone: "secondary" as Tone,
            onPress: () => setOpenLogin("github"),
          },
        ]
      : []),
  ];

  const logoutButton = (
    <Button
      className="w-full gap-2"
      color="danger"
      startContent={<LogOut className="h-4 w-4" />}
      variant="flat"
      onPress={handleLogout}
    >
      退出登录
    </Button>
  );

  return (
    <div className="flex min-h-full flex-col px-3 py-6 lg:px-6">
      {isH5 ? (
        <div className="w-full flex-1 space-y-6">
          <PageHeader title="更多" />

          <div className="flex items-center gap-4 rounded-2xl bg-content1 px-4 py-4 shadow-sm">
            <Avatar name={username} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="truncate text-lg font-semibold">{username}</div>
              <RoleChip isAdmin={isAdmin} />
            </div>
          </div>

          {isAdmin && (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-medium text-default-500">
                管理
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {shortcuts.map((item) => (
                  <button
                    key={item.key}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-content1 px-2 py-4 shadow-sm transition-transform active:scale-[0.97]"
                    type="button"
                    onClick={item.onPress}
                  >
                    <IconTile icon={item.icon} size="lg" tone={item.tone} />
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="px-1 text-xs font-medium text-default-500">
              登录与安全
            </h2>
            <SecurityList items={securityItems} />
          </section>

          {logoutButton}
        </div>
      ) : (
        <div className="w-full max-w-5xl flex-1">
          <PageHeader description="你的账户和登录方式" title="账户与登录" />
          <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4 rounded-2xl border border-divider bg-content1 p-6 shadow-sm">
              <div className="flex flex-col items-center gap-3 text-center">
                <Avatar large name={username} />
                <div className="min-w-0 space-y-1.5">
                  <div className="truncate text-lg font-semibold">
                    {username}
                  </div>
                  <RoleChip isAdmin={isAdmin} />
                </div>
              </div>
              <div className="border-t border-divider pt-4">{logoutButton}</div>
            </aside>
            <SecurityPanel items={securityItems} />
          </div>
        </div>
      )}

      {/* The desktop sidebar already shows the version. */}
      {isH5 && (
        <VersionFooter
          containerClassName="mt-8 text-center"
          poweredClassName="text-xs text-default-400"
          updateBadgeClassName="ml-2 inline-flex items-center rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white"
          version={
            isWebViewFunc() ? siteConfig.app_version : siteConfig.version
          }
          versionClassName="mt-1 text-xs text-default-400"
        />
      )}

      <PasskeyModal
        isOpen={openLogin === "passkey"}
        items={passkeys ?? []}
        onChanged={() => void loadPasskeys()}
        onClose={() => setOpenLogin(null)}
      />
      <GithubBindingModal
        info={github}
        isOpen={openLogin === "github"}
        onChanged={() => void loadGithub()}
        onClose={() => setOpenLogin(null)}
      />

      {/* 修改密码弹窗 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={isOpen}
        placement="center"
        scrollBehavior="inside"
        size="2xl"
        onOpenChange={() => {
          onOpenChange();
          resetPasswordForm();
        }}
      >
        <ModalContent>
          {(onClose: () => void) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                修改密码
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="新用户名"
                    placeholder="请输入新用户名（至少3位）"
                    value={passwordForm.newUsername}
                    variant="bordered"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        newUsername: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="当前密码"
                    placeholder="请输入当前密码"
                    type="password"
                    value={passwordForm.currentPassword}
                    variant="bordered"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="新密码"
                    placeholder="请输入新密码（至少6位）"
                    type="password"
                    value={passwordForm.newPassword}
                    variant="bordered"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="确认密码"
                    placeholder="请再次输入新密码"
                    type="password"
                    value={passwordForm.confirmPassword}
                    variant="bordered"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        confirmPassword: e.target.value,
                      }))
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={passwordLoading}
                  onPress={handlePasswordSubmit}
                >
                  修改密码
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
