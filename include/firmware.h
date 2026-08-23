#pragma once

#ifndef FW_VERSION
#define FW_VERSION          "1.0.0"
#endif
#define FW_CHANNEL          "stable"

#ifndef API_SERVER
#define API_SERVER          "https://chetrika-rayz.onrender.com"
#endif
#ifndef DEVICE_ID
#define DEVICE_ID           "SW589724077000"
#endif
#ifndef DEVICE_API_KEY
#define DEVICE_API_KEY      "cms-device-key-default"
#endif

#define API_DATA_PATH       "/api/data?api_key=" DEVICE_API_KEY
#define API_FW_CHECK_PATH   "/api/iot/firmware/check"
#define API_FW_STATUS_PATH  "/api/iot/firmware/status"
#define API_COMMANDS_PATH   "/api/commands"
