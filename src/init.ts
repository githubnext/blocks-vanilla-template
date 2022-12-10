import { Block } from "@githubnext/blocks";
import { loadBundle, unloadBundle } from "./bundle";
import { callbackFunctions, callbackFunctionsInternal } from "./callbacks";

import "./index.css";

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

  if (data.type !== "setProps") return;

  // the `setProps` protocol is pretty ad-hoc (see `use-block-frame-messages.ts`):
  //   `{ bundle: null }` means the block was not found
  //   `{ bundle: [] }` means the block is from the dev server (load it locally)
  //   `{ bundle: [...] }` means the block is not from the dev server (load the bundle code)
  //   `{ props: ... }` means render the block with new props
  // `setProps` with `bundle` is called once, then `setProps` with `props` one or more times

  if (data.props.bundle) {
    // clear old bundle state
    setBlockProps = undefined;
    unloadBundle();
    bundle = data.props.bundle;
  } else if (data.props.props) {
    props = data.props.props;
  }

  if (!setBlockProps && bundle && props) {
    setBlockProps = await loadBundle(bundle, props.block);
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
