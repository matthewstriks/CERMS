---
id: assistant-remove
keywords: CERMS assistant remove delete uninstall model download local storage disk space Ollama Settings redownload
---

# Removing or reinstalling the CERMS Assistant download

## Before you start

This removes only the fixed CERMS Assistant model from this computer. Ollama and other models remain installed. Other applications using that same model will need to download it again. It does not delete member files, reports or pending chat-review deliveries.

## Steps

1. Finish or cancel an active assistant answer/download, then open Settings → CERMS Assistant.
2. Start Ollama if it is not running and select Check download to refresh status.
3. When Local download installed appears, select Remove assistant download.
4. Review the native confirmation. Cancel leaves the model installed; Remove download deliberately removes it.
5. Wait for Local download not installed. A current idle conversation is finished and queued for its usual quality-assurance review after successful removal.
6. To reinstall later, select Open CERMS Assistant and Download CERMS Assistant. Internet is required for that download; local answers can work offline afterward.

## If unavailable or unsuccessful

Removal is disabled during an active assistant operation. Stop/finish that operation first. If Ollama cannot be reached or deletion cannot be confirmed, open it and use Check download before retrying. Do not delete the entire Ollama folder to remove this one feature. Ollama manages shared layers and partial download cache, so removing a model does not promise an exact amount of reclaimed disk space. Normal CERMS operations and separate bug reporting remain available without the assistant model.
