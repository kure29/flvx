import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ChevronRight,
  KeyRound,
  LogOut,
  Settings,
  Share2,
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
import { updatePassword } from "@/api";
import { safeLogout } from "@/utils/logout";
import { getAdminFlag, getSessionName } from "@/utils/session";
import { PasskeyManager } from "@/components/passkey-manager";
import { PageHeader } from "@/components/page-kit";

interface PasswordForm {
  newUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface MenuItem {
  key: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  danger?: boolean;
  onPress: () => void;
}

function MenuGroup({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-xs font-medium text-default-500">{title}</h2>
      <div className="divide-y divide-divider overflow-hidden rounded-xl border border-divider bg-content1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.key}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-default-100"
              type="button"
              onClick={item.onPress}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${item.danger ? "text-danger" : "text-default-500"}`}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-sm ${item.danger ? "text-danger" : ""}`}
                >
                  {item.label}
                </div>
                {item.description && (
                  <div className="truncate text-xs text-default-400">
                    {item.description}
                  </div>
                )}
              </div>
              {!item.danger && (
                <ChevronRight className="h-4 w-4 shrink-0 text-default-300" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
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

  useEffect(() => {
    // 获取用户信息
    setUsername(getSessionName() || "Admin");
    setIsAdmin(getAdminFlag());
  }, []);

  const go = (path: string) => () => navigate(path);

  // 管理员菜单项
  const adminMenuItems: MenuItem[] = [
    {
      key: "/monitor",
      label: "监控",
      description: "节点与隧道监控",
      icon: Activity,
      onPress: go("/monitor"),
    },
    {
      key: "/panel-sharing",
      label: "面板共享",
      description: "与其他面板进行联邦共享",
      icon: Share2,
      onPress: go("/panel-sharing"),
    },
    {
      key: "/user",
      label: "用户管理",
      description: "用户、分组和限速",
      icon: Users,
      onPress: go("/user"),
    },
    {
      key: "/config",
      label: "网站配置",
      description: "配置网站设置",
      icon: Settings,
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

  const accountMenuItems: MenuItem[] = [
    { key: "password", label: "修改密码", icon: KeyRound, onPress: onOpen },
    {
      key: "logout",
      label: "退出登录",
      icon: LogOut,
      danger: true,
      onPress: handleLogout,
    },
  ];

  return (
    <div className="flex min-h-full flex-col px-3 py-6 lg:px-6">
      <div className="w-full max-w-2xl flex-1">
        <PageHeader description="账户与管理功能" title="更多" />
        <div className="space-y-5">
          {/* 账户 */}
          <div className="flex items-center gap-3 rounded-xl border border-divider bg-content1 px-3 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-default-100 text-sm font-semibold text-default-600">
              {(username || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{username}</div>
              <div className="text-xs text-default-500">
                {isAdmin ? "管理员" : "普通用户"}
              </div>
            </div>
          </div>

          {isAdmin && <MenuGroup items={adminMenuItems} title="管理" />}
          <MenuGroup items={accountMenuItems} title="账户" />

          <PasskeyManager />
        </div>
      </div>

      <VersionFooter
        containerClassName="mt-8 max-w-2xl text-center"
        poweredClassName="text-xs text-default-400"
        updateBadgeClassName="ml-2 inline-flex items-center rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white"
        version={isWebViewFunc() ? siteConfig.app_version : siteConfig.version}
        versionClassName="mt-1 text-xs text-default-400"
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
                  确定
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
