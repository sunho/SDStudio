cmake_minimum_required(VERSION 3.4.1)
set(CMAKE_CXX_STANDARD 17)

add_library(
        native
        SHARED
        native.cpp )

find_library(.
        log-lib
        log )

target_link_libraries(
        native
        ${log-lib} )
