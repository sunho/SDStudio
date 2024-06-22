{
  "targets": [
    {
      "target_name": "sdnative",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ "lib.cpp" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': ['NAPI_DISABLE_CPP_EXCEPTIONS'],
      'msvs_settings': {
        'VCCLCompilerTool': { 'AdditionalOptions': ['/utf-8'], },
      },
    }
  ]
}
