import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { DocFormPage } from "./doc-form-page";
import { DocListPage } from "./doc-list-page";
import type { DocConfig } from "./doc-config";

/**
 * `/<prefix>/*` for an app built from DocConfigs: a list and a form (also `/new`) per config, keyed by the part of
 * `config.base` after the prefix; `index` is the app's home, `extra` any hand-made routes.
 */
export function ConfigRoutes({ prefix, configs, index, extra }: { prefix: string; configs: DocConfig[]; index?: ReactNode; extra?: ReactNode }) {
  const first = configs.find((c) => !c.single);
  return (
    <Routes>
      <Route index element={index ?? (first ? <Navigate to={first.base} replace /> : null)} />
      {configs.map((cfg) => {
        const path = cfg.base.replace(new RegExp(`^/${prefix}/?`), "");
        return cfg.single
          ? <Route key={path} path={path} element={<DocFormPage config={cfg} />} />
          : [
              <Route key={path} path={path} element={<DocListPage config={cfg} />} />,
              <Route key={`${path}/:name`} path={`${path}/:name`} element={<DocFormPage config={cfg} />} />,
            ];
      })}
      {extra}
      <Route path="*" element={<Navigate to={`/${prefix}`} replace />} />
    </Routes>
  );
}
