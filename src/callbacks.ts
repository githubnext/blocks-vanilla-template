import { CommonBlockProps, BlocksRepo } from "@githubnext/blocks";

const pendingRequests: Record<
  string,
  { resolve: (value: unknown) => void; reject: (reason?: any) => void }
> = {};

let uniqueId = 0;
const getUniqueId = () => {
  uniqueId++;
  return uniqueId;
};
export const makeRequest = (type: string, args: any) => {
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

export const callbackFunctions: Pick<
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
    makeRequest("onRequestGitHubEndpoint", { route, parameters }),
  onStoreGet: (key) => makeRequest("onStoreGet", { key }),
  onStoreSet: (key, value) =>
    makeRequest("onStoreSet", { key, value }) as Promise<void>,
  onRequestBlocksRepos: (params) =>
    makeRequest("onRequestBlocksRepos", { params }) as Promise<BlocksRepo[]>,
};
export const callbackFunctionsInternal = {
  ...callbackFunctions,
  private__onFetchInternalEndpoint: (path: string, params: any) =>
    makeRequest("private__onFetchInternalEndpoint", { path, params }),
};

const onMessage = async (event: MessageEvent) => {
  const { data } = event;

  if (!data.requestId) return;

  const request = pendingRequests[data.requestId];
  if (!request) return;

  delete pendingRequests[data.requestId];

  if (data.error) {
    request.reject(data.error);
  } else {
    request.resolve(data.response);
  }
};

addEventListener("message", onMessage);
