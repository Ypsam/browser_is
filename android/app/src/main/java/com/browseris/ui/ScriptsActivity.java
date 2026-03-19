package com.browseris.ui;

import android.app.AlertDialog;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.*;

import androidx.appcompat.app.AppCompatActivity;

import com.browseris.R;
import com.browseris.data.LocalStore;
import com.browseris.model.UserScript;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

public class ScriptsActivity extends AppCompatActivity {
    private LocalStore store;
    private ListView list;
    private ArrayAdapter<String> adapter;
    private List<UserScript> scripts = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scripts);

        store = new LocalStore(this);
        list = findViewById(R.id.list);

        adapter = new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, new ArrayList<>());
        list.setAdapter(adapter);

        findViewById<Button>(R.id.btnAdd).setOnClickListener(v -> openEditor(null));

        list.setOnItemClickListener((parent, view, position, id) -> openEditor(scripts.get(position)));

        list.setOnItemLongClickListener((parent, view, position, id) -> {
            UserScript s = scripts.get(position);
            new AlertDialog.Builder(this)
                    .setTitle("删除脚本？")
                    .setMessage(s.name)
                    .setNegativeButton("取消", null)
                    .setPositiveButton("删除", (d, w) -> {
                        store.removeScript(s.id);
                        refresh();
                    })
                    .show();
            return true;
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        scripts = store.getScripts();
        adapter.clear();
        for (UserScript s : scripts) {
            String line = (s.enabled ? "✅ " : "⛔ ") + s.name + "  [" + s.runAt + "]\n" + s.match;
            adapter.add(line);
        }
        adapter.notifyDataSetChanged();
    }

    private void openEditor(UserScript existing) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24, 16, 24, 0);

        EditText etName = mkEdit("脚本名", false);
        EditText etMatch = mkEdit("匹配（例如：*://*.youtube.com/*）", false);
        Spinner spRunAt = new Spinner(this);
        ArrayAdapter<String> spAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"dom-ready", "did-finish-load"});
        spRunAt.setAdapter(spAdapter);
        CheckBox cbEnabled = new CheckBox(this);
        cbEnabled.setText("启用");
        EditText etCode = mkEdit("脚本内容（JS）", true);

        if (existing != null) {
            etName.setText(existing.name);
            etMatch.setText(existing.match);
            cbEnabled.setChecked(existing.enabled);
            etCode.setText(existing.code);
            spRunAt.setSelection("did-finish-load".equals(existing.runAt) ? 1 : 0);
        } else {
            etName.setText("Auto Scroll Demo");
            etMatch.setText("*://*/*");
            cbEnabled.setChecked(true);
            etCode.setText("(() => {\\n  const step = 250;\\n  setInterval(() => window.scrollBy(0, step), 1200);\\n})();\\n");
            spRunAt.setSelection(0);
        }

        root.addView(etName);
        root.addView(space());
        root.addView(etMatch);
        root.addView(space());
        root.addView(spRunAt);
        root.addView(space());
        root.addView(cbEnabled);
        root.addView(space());
        root.addView(etCode);

        new AlertDialog.Builder(this)
                .setTitle(existing == null ? "新增脚本" : "编辑脚本")
                .setView(root)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (d, w) -> {
                    String id = existing != null ? existing.id : genId();
                    String name = etName.getText() == null ? "" : etName.getText().toString().trim();
                    String match = etMatch.getText() == null ? "" : etMatch.getText().toString().trim();
                    String runAt = String.valueOf(spRunAt.getSelectedItem());
                    boolean enabled = cbEnabled.isChecked();
                    String code = etCode.getText() == null ? "" : etCode.getText().toString();
                    if (name.isEmpty()) name = "Untitled Script";
                    if (match.isEmpty()) match = "*://*/*";
                    store.upsertScript(new UserScript(id, name, match, runAt, enabled, code));
                    refresh();
                })
                .show();
    }

    private EditText mkEdit(String hint, boolean multiline) {
        EditText et = new EditText(this);
        et.setHint(hint);
        if (multiline) {
            et.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
            et.setMinLines(6);
        } else {
            et.setInputType(InputType.TYPE_CLASS_TEXT);
            et.setSingleLine(true);
        }
        return et;
    }

    private View space() {
        Space s = new Space(this);
        s.setMinimumHeight(14);
        return s;
    }

    private String genId() {
        long now = System.currentTimeMillis();
        int r = new Random().nextInt(10000);
        return Long.toString(now, 36) + "_" + String.format(Locale.US, "%04d", r);
    }
}

