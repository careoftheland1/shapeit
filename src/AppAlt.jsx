import { useEffect } from "react";
import App from "./App.jsx";
import "./alt.css";

function AppAlt() {
  useEffect(() => {
    const tagPanels = () => {
      document.querySelectorAll(".buildit-alt .glass-scroll").forEach((panel) => {
        if (panel.style.left) {
          panel.classList.add("alt-menu-panel");
          const rows = panel.children;
          rows[0]?.classList.add("alt-menu-head");
          rows[1]?.classList.add("alt-project-actions");
          rows[2]?.classList.add("alt-add-actions");
          rows[3]?.classList.add("alt-history-actions");
          rows[4]?.classList.add("alt-roof-actions");
          rows[5]?.classList.add("alt-unit-actions");
        }
        if (panel.style.right) panel.classList.add("alt-takeoff-panel");
      });
    };
    tagPanels();
    const observer = new MutationObserver(tagPanels);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <div className="buildit-alt">
    <div className="alt-header">
      <a href="https://onthe.land">shelter&nbsp;&nbsp;&nbsp;on the&nbsp;&nbsp;land</a>
      <span>building blocks</span>
    </div>
    <App />
  </div>;
}

export default AppAlt;
