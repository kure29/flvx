import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Card, CardBody } from "@/shadcn-bridge/heroui/card";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Input } from "@/shadcn-bridge/heroui/input";
import {
  beginGithubBind,
  finishGithubBind,
  getGithubInfo,
  unbindGithub,
  type GithubInfo,
} from "@/api";
import { useWebViewMode } from "@/hooks/useWebViewMode";
import {
  githubRedirectUri,
  goToGithub,
  takeGithubCallback,
} from "@/utils/github-login";

/** Binds the GitHub account used for GitHub login (profile page). */
export function GithubBinding() {
  const [info, setInfo] = useState<GithubInfo | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const isWebView = useWebViewMode();

  const refresh = () =>
    getGithubInfo()
      .then((res) => {
        if (res.code === 0) setInfo(res.data);
      })
      .catch(() => setInfo(null));

  useEffect(() => {
    const callback = takeGithubCallback("bind");

    if (!callback) {
      void refresh();

      return;
    }
    if ("error" in callback) {
      toast.error(callback.error);
      void refresh();

      return;
    }
    setBusy(true);
    finishGithubBind(callback.code, callback.state)
      .then((res) => {
        if (res.code !== 0) {
          toast.error(res.msg || "绑定失败", { duration: 6000 });

          return;
        }
        toast.success(`已绑定 GitHub 账号 ${res.data.login}`);
      })
      .catch(() => toast.error("绑定失败"))
      .finally(() => {
        setBusy(false);
        void refresh();
      });
  }, []);

  // Hidden until an admin turns GitHub login on, unless already bound so
  // the user can still unbind.
  if (!info || isWebView || (!info.enabled && !info.bound)) return null;

  const bind = async () => {
    if (!password) {
      toast.error("请输入当前密码");

      return;
    }
    setBusy(true);
    try {
      const res = await beginGithubBind(githubRedirectUri("bind"), password);

      if (res.code !== 0) {
        toast.error(res.msg || "无法绑定 GitHub");
        setBusy(false);

        return;
      }
      goToGithub("bind", res.data.url);
    } catch {
      toast.error("无法绑定 GitHub");
      setBusy(false);
    }
  };

  const unbind = async () => {
    if (!password) {
      toast.error("请输入当前密码以解绑");

      return;
    }
    setBusy(true);
    try {
      const res = await unbindGithub(password);

      if (res.code !== 0) {
        toast.error(res.msg || "解绑失败");

        return;
      }
      toast.success("已解绑 GitHub 账号");
      setPassword("");
      await refresh();
    } catch {
      toast.error("解绑失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody className="p-4 space-y-4">
        <div>
          <h3 className="text-base font-medium">GitHub 登录</h3>
          <p className="text-sm text-default-500">
            {info.bound
              ? `已绑定 GitHub 账号 ${info.login}，可在登录页使用 GitHub 登录。`
              : "绑定后可在登录页使用 GitHub 账号登录。"}
            绑定和解绑均需输入当前密码。
          </p>
        </div>
        <Input
          label="当前密码"
          type="password"
          value={password}
          variant="bordered"
          onChange={(e) => setPassword(e.target.value)}
        />
        {info.bound ? (
          <Button
            color="danger"
            disabled={busy}
            variant="flat"
            onPress={() => void unbind()}
          >
            解绑 GitHub
          </Button>
        ) : (
          <Button disabled={busy} onPress={() => void bind()}>
            绑定 GitHub 账号
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
