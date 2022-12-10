import React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import ReactDOM from "react-dom";
import ReactDOMClient from "react-dom/client";
import * as PrimerReact from "@primer/react";

import { Block, FileContext, FolderContext } from "@githubnext/blocks";

const loadDevServerBlock = async (block: Block) => {
  const imports = import.meta.glob("../blocks/**");
  const importPath = "../" + block.entry;
  const importContent = imports[importPath];
  const content = await importContent();
  return content.default;
};

const elements: HTMLElement[] = [];
const root = ReactDOMClient.createRoot(document.getElementById("root"));

const findBlockBundleName = (bundle: { name: string; content: string }[]) => {
  let blockBundleName;
  bundle.forEach((asset) => {
    if (asset.name.endsWith(".js")) {
      blockBundleName = asset.content.match(/^"use strict";var ([^=]+)=/)?.[1];
    }
  });
  return blockBundleName;
};

const loadReactContent = (content: string) => {
  return `
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
${content}
  return BlockBundle;
};`;
};

export const unloadBundle = () => {
  for (const el of elements || []) {
    document.body.removeChild(el);
  }
  elements.splice(0, elements.length);
};

const loadBlockBundle = (
  blockBundleName: string,
  bundle: { name: string; content: string }[]
) => {
  bundle.forEach((asset) => {
    if (asset.name.endsWith(".css")) {
      const cssElement = document.createElement("style");
      cssElement.textContent = asset.content;
      elements.push(cssElement);
    } else if (asset.name.endsWith(".js")) {
      let content;
      if (blockBundleName === "BlockBundle") {
        content = loadReactContent(asset.content);
      } else if (blockBundleName === "VanillaBlockBundle") {
        content = asset.content;
      } else {
        throw new Error(`unknown block bundle name '${blockBundleName}'`);
      }
      const jsElement = document.createElement("script");
      jsElement.textContent = content;
      elements.push(jsElement);
    }
  });
  for (const el of elements) {
    document.body.appendChild(el);
  }
};

const makeReactSetBlockProps = () => {
  const Block = window.BlockBundle({
    React,
    ReactJSXRuntime,
    ReactDOM,
    ReactDOMClient,
    PrimerReact,
  }).default;
  type BlockComponentProps = {
    context: FileContext | FolderContext;
    block: Block;
  };
  const BlockComponent = ({ block, context }: BlockComponentProps) => {
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

const makeVanillaSetBlockProps = () => {
  return (props) => {
    // TODO(jaked)
    // what should BlockComponent look like for vanilla blocks?
    window.VanillaBlockBundle.default(props);
  };
};

const makeSetBlockProps = (blockBundleName: string) => {
  if (blockBundleName === "BlockBundle") {
    return makeReactSetBlockProps();
  } else if (blockBundleName === "VanillaBlockBundle") {
    return makeVanillaSetBlockProps();
  } else {
    throw new Error(`unknown block bundle name '${blockBundleName}'`);
  }
};

export const loadBundle = async (
  bundle: { name: string; content: string }[],
  block: Block
) => {
  if (bundle.length === 0) {
    return await loadDevServerBlock(block);
  } else {
    const blockBundleName = findBlockBundleName(bundle);
    loadBlockBundle(blockBundleName, bundle);
    return makeSetBlockProps(blockBundleName);
  }
};
