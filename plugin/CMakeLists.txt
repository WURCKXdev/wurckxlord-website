cmake_minimum_required(VERSION 3.22)
project(FLUX VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Static MSVC runtime: the plugin works without installing the Visual C++ redistributable.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Use a local JUCE checkout with -DFLUX_JUCE_DIR=path, otherwise download JUCE 8.0.9.
if(FLUX_JUCE_DIR)
    add_subdirectory(${FLUX_JUCE_DIR} JUCE)
else()
    include(FetchContent)
    FetchContent_Declare(JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.9
        GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(JUCE)
endif()

juce_add_plugin(FLUX
    COMPANY_NAME "WurckxLord"
    BUNDLE_ID com.wurckxlord.flux
    PLUGIN_MANUFACTURER_CODE Wrck
    PLUGIN_CODE Flx1
    FORMATS VST3 Standalone
    PRODUCT_NAME "FLUX"
    DESCRIPTION "Expressive line-based MPE sequencer"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE
    VST3_CATEGORIES Instrument Synth)

target_sources(FLUX PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/PianoRoll.cpp)

target_compile_definitions(FLUX PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(FLUX
    PRIVATE juce::juce_audio_utils
    PUBLIC juce::juce_recommended_config_flags
           juce::juce_recommended_lto_flags
           juce::juce_recommended_warning_flags)

option(FLUX_BUILD_TESTS "Build the FLUX headless test runner" OFF)
if(FLUX_BUILD_TESTS)
    # Compiled with the plugin's own settings and linked against its shared code.
    add_executable(FluxTests Tests/FluxTests.cpp)
    target_compile_definitions(FluxTests PRIVATE $<TARGET_PROPERTY:FLUX,COMPILE_DEFINITIONS>)
    target_include_directories(FluxTests PRIVATE $<TARGET_PROPERTY:FLUX,INCLUDE_DIRECTORIES>)
    target_link_libraries(FluxTests PRIVATE FLUX)
endif()
