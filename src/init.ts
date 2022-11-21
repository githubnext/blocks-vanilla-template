import { Block, BlocksRepo, CommonBlockProps } from "@githubnext/blocks";
import "./index.css";

const onInit = () => {
  // redirect from the server to the production blocks frame
  if (window === window.top) {
    window.location.href = `https://blocks.githubnext.com/githubnext/blocks-tutorial?devServer=${encodeURIComponent(
      window.location.href
    )}`;
    return;
  }

  let entry;
  let setBlockProps;
  let props = {};

  const onMessage = async (event: MessageEvent) => {
    const { data } = event;

    if (data.type === "setProps") {
      props = { ...props, ...data.props.props };

      // when the block changes
      if (props.block && entry !== props.block.entry) {
        entry = props.block.entry;
        const imports = import.meta.glob("../blocks/**");
        const importPath = "../" + props.block.entry;
        const importContent = imports[importPath];
        const content = await importContent();
        setBlockProps = content.default;
      }

      const wrappedSetBlockProps = (props) => {
        if (!setBlockProps) return;
        const isInternal =
          (props as unknown as { block: Block }).block.owner === "githubnext";
        const filteredCallbackFunctions = isInternal
          ? callbackFunctionsInternal
          : callbackFunctions;
        const onUpdateContent = (content: string) => {
          filteredCallbackFunctions["onUpdateContent"](content);
          console.log(filteredCallbackFunctions["onUpdateContent"], content);
          props = { ...props, content };
          wrappedSetBlockProps(props);
        };
        setBlockProps({
          ...props,
          ...filteredCallbackFunctions,
          onUpdateContent,
        });
      };
      wrappedSetBlockProps(props);
    }

    // handle callback responses
    if (data.requestId) {
      const request = pendingRequests[data.requestId];
      if (!request) return;

      delete pendingRequests[data.requestId];

      if (data.error) {
        request.reject(data.error);
      } else {
        request.resolve(data.response);
      }
    }
  };
  addEventListener("message", onMessage);

  const onLoad = () => {
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

  // implement callback functions
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
    | "onStoreGet"
    | "onStoreSet"
    | "onRequestBlocksRepos"
  > = {
    onUpdateMetadata: (metadata) =>
      makeRequest("onUpdateMetadata", { metadata }),
    onNavigateToPath: (path) => makeRequest("onNavigateToPath", { path }),
    onUpdateContent: (content) => makeRequest("onUpdateContent", { content }),
    onRequestGitHubData: (path, params) =>
      makeRequest("onRequestGitHubData", { path, params }),
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
};

onInit();

/*
TODO
- [x] strip out React stuff
- [x] hook up rest of message passing API
- [ ] handle code bundles
- [ ] hot reload block code in dev
  - turns out this works via HMR and the Vite React plugin
  - so this works out of the box as long as the plugin is enabled
  - the whole block module is reloaded, currently `createRoot` is called every time
*/
