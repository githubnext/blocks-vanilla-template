import React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import ReactDOM from "react-dom";
import ReactDOMClient from "react-dom/client";
import * as PrimerReact from "@primer/react";

import {
  Block,
  BlocksRepo,
  CommonBlockProps,
  FileContext,
  FolderContext,
} from "@githubnext/blocks";

import "./index.css";

const pendingRequests: Record<
  string,
  { resolve: (value: unknown) => void; reject: (reason?: any) => void }
> = {};

let uniqueId = 0;
const getUniqueId = () => {
  uniqueId++;
  return uniqueId;
};
const makeRequest = (type: string, args: any) => {
  // for responses to this specific request
  const requestId = type + "--" + getUniqueId();

  window.top?.postMessage(
    {
      type,
      payload: args,
      requestId,
    },
    "*"
  );

  // wait for a responding message to return
  return new Promise((resolve, reject) => {
    pendingRequests[requestId] = { resolve, reject };
    const maxDelay = 1000 * 5;
    window.setTimeout(() => {
      delete pendingRequests[requestId];
      reject(new Error("Timeout"));
    }, maxDelay);
  });
};
const callbackFunctions: Pick<
  CommonBlockProps,
  | "onUpdateMetadata"
  | "onNavigateToPath"
  | "onUpdateContent"
  | "onRequestGitHubData"
  | "onRequestGitHubEndpoint"
  | "onStoreGet"
  | "onStoreSet"
  | "onRequestBlocksRepos"
> = {
  onUpdateMetadata: (metadata) => makeRequest("onUpdateMetadata", { metadata }),
  onNavigateToPath: (path) => makeRequest("onNavigateToPath", { path }),
  onUpdateContent: (content) => makeRequest("onUpdateContent", { content }),
  onRequestGitHubData: (path, params) =>
    makeRequest("onRequestGitHubData", { path, params }),
  onRequestGitHubEndpoint: (route, parameters) =>
    makeRequest("onRequestGitHubData", { route, parameters }),
  onStoreGet: (key) => makeRequest("onStoreGet", { key }),
  onStoreSet: (key, value) =>
    makeRequest("onStoreSet", { key, value }) as Promise<void>,
  onRequestBlocksRepos: (params) =>
    makeRequest("onRequestBlocksRepos", { params }) as Promise<BlocksRepo[]>,
};
const callbackFunctionsInternal = {
  ...callbackFunctions,
  private__onFetchInternalEndpoint: (path: string, params: any) =>
    makeRequest("private__onFetchInternalEndpoint", { path, params }),
};

export type BlockComponentProps = {
  context: FileContext | FolderContext;
  block: Block;
};
export const BlockComponent = ({ block, context }: BlockComponentProps) => {
  const { owner, repo, id, type } = block;
  const hash = encodeURIComponent(
    JSON.stringify({ block: { owner, repo, id, type }, context })
  );
  return React.createElement("iframe", {
    src: `/#${hash}`,
    sandbox: "allow-scripts allow-same-origin allow-forms allow-downloads",
    style: {
      width: "100%",
      height: "100%",
      border: 0,
    },
  });
};

const loadDevServerBlock = async (block: Block) => {
  const imports = import.meta.glob("../blocks/**");
  const importPath = "../" + block.entry;
  const importContent = imports[importPath];
  const content = await importContent();
  return content.default;
};

const elements: HTMLElement[] = [];
const root = ReactDOMClient.createRoot(document.getElementById("root"));

const loadBundleBlock = (bundle: { name: string; content: string }[]) => {
  bundle.forEach((asset) => {
    if (asset.name.endsWith(".js")) {
      const jsElement = document.createElement("script");
      jsElement.textContent = `
var BlockBundle = ({ React, ReactJSXRuntime, ReactDOM, ReactDOMClient, PrimerReact }) => {
  function require(name) {
    switch (name) {
      case "react":
        return React;
      case "react/jsx-runtime":
        return ReactJSXRuntime;
      case "react-dom":
        return ReactDOM;
      case "react-dom/client":
        return ReactDOMClient;
      case "@primer/react":
      case "@primer/components":
        return PrimerReact;
      default:
        console.log("no module '" + name + "'");
        return null;
    }
  }
${asset.content}
  return BlockBundle;
};`;
      elements.push(jsElement);
    } else if (asset.name.endsWith(".css")) {
      const cssElement = document.createElement("style");
      cssElement.textContent = asset.content;
      elements.push(cssElement);
    }
  });
  for (const el of elements) {
    document.body.appendChild(el);
  }
  const Block = window.BlockBundle({
    React,
    ReactJSXRuntime,
    ReactDOM,
    ReactDOMClient,
    PrimerReact,
  }).default;
  return (props) => {
    const WrappedBlockComponent = (nestedProps: BlockComponentProps) => {
      let context = {
        ...props.context,
        ...nestedProps.context,
      };

      // clear sha if viewing content from another repo
      const parentRepo = [props.context.owner, props.context.repo].join("/");
      const childRepo = [context.owner, context.repo].join("/");
      const isSameRepo = parentRepo === childRepo;
      if (!isSameRepo) {
        context.sha = nestedProps.context.sha || "HEAD";
      }

      return React.createElement(BlockComponent, {
        ...nestedProps,
        context,
      });
    };
    root.render(
      React.createElement(Block, {
        ...props,
        BlockComponent: WrappedBlockComponent,
      })
    );
  };
};

// redirect from the server to the production blocks frame
if (window === window.top) {
  window.location.href = `https://blocks.githubnext.com/githubnext/blocks-tutorial?devServer=${encodeURIComponent(
    window.location.href
  )}`;
}

let bundle: undefined | null | { name: string; content: string }[] = undefined;
let setBlockProps;
let props;

const onMessage = async (event: MessageEvent) => {
  const { data } = event;

  if (data.requestId) {
    const request = pendingRequests[data.requestId];
    if (!request) return;

    delete pendingRequests[data.requestId];

    if (data.error) {
      request.reject(data.error);
    } else {
      request.resolve(data.response);
    }

    // don't render on API responses
    return;
  }

  if (data.type === "setProps") {
    // the `setProps` protocol is pretty ad-hoc (see `use-block-frame-messages.ts`):
    //   `{ bundle: null }` means the block was not found
    //   `{ bundle: [] }` means the block is from the dev server (load it locally)
    //   `{ bundle: [...] }` means the block is not from the dev server (load the bundle code)
    //   `{ props: ... }` means render the block with new props
    // `setProps` with `bundle` is called once, then `setProps` with `props` one or more times

    if (data.props.bundle) {
      // clear old bundle state
      setBlockProps = undefined;
      for (const el of elements || []) {
        document.body.removeChild(el);
      }
      elements.splice(0, elements.length);
      bundle = data.props.bundle;
    } else if (data.props.props) {
      props = data.props.props;
    }
  }

  if (!setBlockProps && bundle && props) {
    if (bundle.length === 0) {
      setBlockProps = await loadDevServerBlock(props.block);
    } else {
      setBlockProps = loadBundleBlock(bundle);
    }
  }

  if (bundle === null) {
    // TODO(jaked)
    // render not found
  } else if (!setBlockProps) {
    // TODO(jaked)
    // render loading
  } else {
    const wrappedSetBlockProps = (props) => {
      if (!setBlockProps) return;
      const isInternal =
        (props as unknown as { block: Block }).block.owner === "githubnext";
      const filteredCallbackFunctions = isInternal
        ? callbackFunctionsInternal
        : callbackFunctions;
      const onUpdateContent = (content: string) => {
        // the app does not send async content updates back to the block that
        // originated them, to avoid overwriting subsequent changes; we update the
        // content locally so controlled components work. this doesn't overwrite
        // subsequent changes because it's synchronous.
        props = { ...props, content };
        wrappedSetBlockProps(props);
        filteredCallbackFunctions["onUpdateContent"](content);
      };
      setBlockProps({
        ...props,
        ...filteredCallbackFunctions,
        onUpdateContent,
      });
    };
    wrappedSetBlockProps(props);
  }
};
addEventListener("message", onMessage);

const onLoad = () => {
  // TODO(jaked)
  // clear previous block bundle if the block has changed
  window.top?.postMessage(
    {
      type: "loaded",
      hash: window.location.hash,
    },
    "*"
  );
};

onLoad();
addEventListener("hashchange", onLoad);
