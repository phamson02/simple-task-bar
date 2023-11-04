import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class MyPrefsWidget extends ExtensionPreferences {
    _init() {
        super._init();

        // Load the UI from the glade file
        this._builder = new Gtk.Builder();
        this._builder.add_from_file(`${this.extension.dir.get_path()}/prefs.ui`);
        
        // The main container from the builder
        this.main_widget = this._builder.get_object('main_prefs');
        this.append(this.main_widget);

        // Initialize the settings schema
        this._initSettings();
    }

    // Initialize settings
    _initSettings() {
        this._settings = this.getSettings('org.gnome.shell.extensions.simple-task-bar');

        // Bind the settings to the UI elements
        const schemaKeys = this._settings.list_keys();
        schemaKeys.forEach(key => {
            const widget = this._builder.get_object(key);
            if (widget) {
                const bindProperty = this._getBindProperty(key);
                this._settings.bind(key, widget, bindProperty, Gio.SettingsBindFlags.DEFAULT);
            }
        });
    }

    // Determine the property to bind based on the setting type
    _getBindProperty(key) {
        let ints = ['hidden-opacity', 'icon-size', 'padding-between-workspaces'];
        let strings = ['sticky-workspace-label', 'custom-workspace-labels'];
        // let bools = ['places-menu-icon', 'remove-activities', 'display-sticky-workspace', 'display-custom-workspaces', 'display-last-workspace', 'display-workspaces', 'desaturated-icons', 'show-window-titles'];

        if (ints.includes(key)) {
            return "value"; // spinbox.value
        } else if (strings.includes(key)) {
            return "text"; // entry.text
        } else {
            return "active"; // SHOULD mean bools.includes(key) == true, so switch.active
        }
    }
}
