{
  "targets": [
    {
      "target_name": "sdnative",
      "cflags!": [ "-fno-exception" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ "lib.cpp" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': ['NAPI_DISABLE_CPP_EXCEPTIONS'],
    }
  ]
}
