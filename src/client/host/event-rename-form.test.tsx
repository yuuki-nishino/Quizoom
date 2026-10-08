import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventRenameForm } from "./event-rename-form";

describe("EventRenameForm", () => {
  it("shows the current title in an input with save and cancel buttons", () => {
    const markup = renderToStaticMarkup(<EventRenameForm initialTitle="新年会クイズ" onSave={async () => true} onCancel={() => {}} />);
    expect(markup).toContain('value="新年会クイズ"');
    expect(markup).toContain("保存");
    expect(markup).toContain("キャンセル");
  });
});
