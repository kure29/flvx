import {
  Atom,
  Bird,
  Box,
  Cat,
  Layers,
  Link2,
  type LucideIcon,
  Rocket,
  Waves,
} from "lucide-react";

/** Clients a subscription can be imported into. format is the link's
 * ?format= value; importURL opens the app's own import (null: copy only).
 * With routing rules, clients with configImportURL set get a full
 * configuration instead of a node list, imported through it. */
export interface SubClient {
  key: string;
  label: string;
  /** A small glyph on a tile in the client's colour, shown before the name
   * (a hint, not the app's official icon). */
  icon: LucideIcon;
  tile: string;
  format: string;
  importURL: ((url: string, name: string) => string) | null;
  configImportURL?: ((url: string, name: string) => string) | null;
}

const enc = encodeURIComponent;

export const SUB_CLIENTS: SubClient[] = [
  {
    key: "clash",
    label: "mihomo",
    icon: Cat,
    tile: "bg-indigo-500",
    format: "clash",
    importURL: (url, name) =>
      `clash://install-config?url=${enc(url)}&name=${enc(name)}`,
  },
  {
    key: "singbox",
    label: "sing-box",
    icon: Box,
    tile: "bg-slate-700",
    format: "singbox",
    importURL: (url, name) =>
      `sing-box://import-remote-profile?url=${enc(url)}#${enc(name)}`,
  },
  {
    key: "shadowrocket",
    label: "Shadowrocket",
    icon: Rocket,
    tile: "bg-sky-500",
    format: "shadowrocket",
    importURL: (url, name) =>
      `shadowrocket://add/sub://${btoa(url)}?remark=${enc(name)}`,
    configImportURL: (url) => `shadowrocket://config/add/${url}`,
  },
  {
    key: "loon",
    label: "Loon",
    icon: Bird,
    tile: "bg-teal-500",
    format: "loon",
    importURL: (url) => `loon://import?nodelist=${enc(url)}`,
    configImportURL: null,
  },
  {
    key: "qx",
    label: "Quantumult X",
    icon: Atom,
    tile: "bg-violet-500",
    format: "qx",
    importURL: (url, name) =>
      `quantumult-x:///add-resource?remote-resource=${enc(
        JSON.stringify({ server_remote: [`${url}, tag=${name}`] }),
      )}`,
    configImportURL: null,
  },
  {
    key: "surge",
    label: "Surge",
    icon: Waves,
    tile: "bg-blue-600",
    format: "surge",
    importURL: (url) => `surge:///install-config?url=${enc(url)}`,
  },
  {
    key: "stash",
    label: "Stash",
    icon: Layers,
    tile: "bg-amber-500",
    format: "stash",
    importURL: (url) => `stash://install-config?url=${enc(url)}`,
  },
  {
    key: "base64",
    label: "通用",
    icon: Link2,
    tile: "bg-default-400",
    format: "base64",
    importURL: null,
  },
];
