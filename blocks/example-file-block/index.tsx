import { FileBlockProps, FolderBlockProps } from "@githubnext/blocks";
import "./index.css";

const root = document.getElementById("root")

function setProps(props: FileBlockProps | FolderBlockProps) {
  console.log("setProps", props);
  const newPre = document.createElement("pre");
  newPre.innerText = props.content
  const button = document.createElement("button");
  button.innerText = "Click me";
  button.onclick = async () => {
    props.onUpdateContent("Hello from the other side");

    const historicalCommits = await props.onRequestGitHubData(`/repos/${props.context.owner}/${props.context.repo}/commits`, {
      path: props.context.path,
    });
    console.log("historicalCommits", historicalCommits);
  };
  root.innerHTML = "";
  root.appendChild(button)
  root.appendChild(newPre)
}

export default setProps;
