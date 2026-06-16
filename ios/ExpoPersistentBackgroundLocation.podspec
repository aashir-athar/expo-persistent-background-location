require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoPersistentBackgroundLocation'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  # iOS only — background GPS, significant-location-change, and the `location`
  # background mode have no tvOS equivalent, so tvOS is intentionally unsupported.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/aashir-athar/expo-persistent-background-location' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # System SQLite for the native offline buffer (`import SQLite3`).
  s.libraries = 'sqlite3'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
