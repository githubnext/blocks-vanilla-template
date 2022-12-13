import { Block } from "@githubnext/blocks";
import { init } from "@githubnext/blocks-runtime";

import "./index.css";

// redirect from the server to the production blocks frame
if (window === window.top) {
  window.location.href = `https://blocks.githubnext.com/githubnext/blocks-tutorial?devServer=${encodeURIComponent(
    window.location.href
  )}`;
}

const loadDevServerBlock = async (block: Block) => {
  // @ts-ignore
  const imports = import.meta.glob("../blocks/**");
  const importPath = "../" + block.entry;
  const importContent = imports[importPath];
  const content = await importContent();
  return content.default;
};

init(loadDevServerBlock);
