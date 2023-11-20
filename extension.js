/* 
	Simple Task Bar
	Copyright Francois Thirioux 2020
	GitHub contributors: @fthx (original extension), @leleat (more settings, settings UI)
	License GPL v3
*/

import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
// import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
const N_ = x => x;


export default class WindowList extends Extension {

	// create the task bar container and signals
	constructor(metadata){
		super(metadata);
	}

	// destroy the task bar
	_destroy() {
		if (this.settings.get_boolean("remove-activities")) {
			this._set_Activities_visibility(true);
		};

		if (this.settings.get_boolean("places-menu-icon")) {
			this._set_Places_to_icon(true);
		};

		// disconnect all signals
		global.display.disconnect(this._restacked);
		global.display.disconnect(this._window_change_monitor);
		global.workspace_manager.disconnect(this._workspace_changed);
		global.workspace_manager.disconnect(this._workspace_number_changed);

		// disconnect signals for settings change
		this.signals_array.forEach(signalID => this.settings.disconnect(signalID));
		
		// destroy task bar container
		this.apps_menu.destroy();
	}
	
	// hide Activities button
	_set_Activities_visibility(extension_disabled) {
		if ( (extension_disabled == true && this.settings.get_boolean("remove-activities")) || !this.settings.get_boolean("remove-activities") ) {
			let activities_indicator = Main.panel.statusArea['activities'];
			if (activities_indicator && !Main.sessionMode.isLocked) {
				activities_indicator.container.show();
			}
		} else {
			let activities_indicator = Main.panel.statusArea['activities'];
			if (activities_indicator) {
				activities_indicator.container.hide();
			}
		}
	}

	// change Places label to folder icon or restore label
	_set_Places_to_icon(extension_disabled) {
		let places_menu_indicator = Main.panel.statusArea['places-menu'];
		if (places_menu_indicator) {
			places_menu_indicator.remove_child(places_menu_indicator.get_first_child());
			let places_menu_box = new St.BoxLayout({style_class: 'panel-status-menu-box'});

			if ( (extension_disabled == true && this.settings.get_boolean("places-menu-icon")) || !this.settings.get_boolean("places-menu-icon") ) {
				let places_menu_label = new St.Label({
					text: _('Places'),
					y_expand: true,
					y_align: Clutter.ActorAlign.CENTER,
				});
				places_menu_box.add_child(places_menu_label);
				places_menu_box.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
				places_menu_indicator.add_actor(places_menu_box);
			} else {
				let places_menu_icon = new St.Icon({ icon_name: 'folder-symbolic', style_class: 'system-status-icon' });
				places_menu_box.add_child(places_menu_icon);
				places_menu_box.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
				places_menu_indicator.add_actor(places_menu_box);
			}
		}
	}

	// update the task bar
    _updateMenu() {   
    	// destroy old task bar 	
    	this.apps_menu.destroy_all_children();
    	
		// NOT WORKING: update the focused window title
    	this._updateTitle();
    	
    	// track windows and get the number of workspaces
        this.tracker = Shell.WindowTracker.get_default();
        this.workspaces_count = global.workspace_manager.get_n_workspaces();
		
		// do this for all existing workspaces
		if (this.settings.get_boolean("display-last-workspace")) {
			this.last_workspace = this.workspaces_count
		} else {
			this.last_workspace = this.workspaces_count - 1
		};
        for (let workspace_index = 0; workspace_index < this.last_workspace; ++workspace_index) {
        
            let metaWorkspace = global.workspace_manager.get_workspace_by_index(workspace_index);
            this.windows = metaWorkspace.list_windows().sort(this._sortWindows);
            
            // create sticky workspace icon + all sticky windows (on all workspaces) icons and buttons
            if (workspace_index == 0) {
            	this.sticky_windows = this.windows.filter(
            		function(w) {
                		return !w.is_skip_taskbar() && w.is_on_all_workspaces();
            		}
            	);
            	
				if (this.settings.get_boolean("display-sticky-workspace")) {
				    if (this.sticky_windows.length > 0) {
						this.allws_box = new St.Bin({visible: true, 
											reactive: true, can_focus: true, track_hover: true});						
						this.allws_box.label = new St.Label({y_align: Clutter.ActorAlign.CENTER});
						this.allws_box.label.style_class = 'desk-label-active';
						this.allws_box.label.set_text((" " + this.settings.get_string("sticky-workspace-label") + " ").toString());
						this.allws_box.set_child(this.allws_box.label);
						this.apps_menu.add_actor(this.allws_box);
				    };
				};			
				
            	for ( let i = 0; i < this.sticky_windows.length; ++i ) {
	            	let metaWindow = this.sticky_windows[i];
	            	let box = new St.Bin({visible: true, 
        						reactive: true, can_focus: true, track_hover: true});
	            	box.window = this.sticky_windows[i];
	           		box.window.connect("notify::title", this._updateTitle.bind(this));
	            	box.tooltip = box.window.get_title();
	            	box.app = this.tracker.get_window_app(box.window);
					box.connect('button-press-event', () => {
						this._activateWindow(metaWorkspace, metaWindow);
					});
		            box.icon = box.app.create_icon_texture(this.settings.get_int("icon-size"));
		            if (this.settings.get_boolean("desaturated-icons")) {
						let iconEffect = new Clutter.DesaturateEffect();
						box.icon.add_effect(iconEffect);
					}
		            if (metaWindow.is_hidden()) {
						box.icon.set_opacity(this.settings.get_int("hidden-opacity")); box.style_class = 'hidden-app';
		            }
		            else {
		            	 if (metaWindow.has_focus()) {box.style_class = 'focused-app';}
		            	 else {box.style_class = 'unfocused-app';}
		            };
		           	box.set_child(box.icon);
		           	box.connect('notify::hover', () => {
		            							this._onHover(box, box.tooltip); } );
		            this.apps_menu.add_actor(box);
            	}
            };
            
            // create all workspaces labels and buttons
            if (this.settings.get_boolean("display-workspaces")) {
				// add an empty/non-interactive button for padding; add it before the actual Workspace button
				if (this.settings.get_int("padding-between-workspaces") > 0) {
					this.padding_box = new St.Bin({visible: true,
						reactive: false, can_focus: false, track_hover: false});
					this.padding_box.set_width(this.settings.get_int("padding-between-workspaces"));
					this.apps_menu.add_actor(this.padding_box);
				}

		    	this.ws_box = new St.Bin({visible: true, 
								reactive: true, can_focus: true, track_hover: true});
				this.ws_box.label = new St.Label({y_align: Clutter.ActorAlign.CENTER});
		    	if (global.workspace_manager.get_active_workspace() === metaWorkspace) {
					this.ws_box.label.style_class = 'desk-label-active';
				}
				else {
					this.ws_box.label.style_class = 'desk-label-inactive';
				};
				let custom_ws_labels = this.settings.get_string("custom-workspace-labels").split(",");
				if (this.settings.get_boolean("display-custom-workspaces") && workspace_index < custom_ws_labels.length) {
					this.ws_box.label.set_text((" " + custom_ws_labels[workspace_index].trim() + " ").toString());
				} else {
					this.ws_box.label.set_text((" " + (workspace_index+1) + " ").toString());
				};
				this.ws_box.set_child(this.ws_box.label);
				this.ws_box.connect('button-press-event', () => {
		        							this._activateWorkspace(metaWorkspace); } );
		        this.apps_menu.add_actor(this.ws_box);
		    	
		    	this.windows = this.windows.filter(
		        	function(w) {
		            	return !w.is_skip_taskbar() && !w.is_on_all_workspaces();
		           	}
		        );
		    };
			
			// create all normal windows icons and buttons
            for ( let i = 0; i < this.windows.length; ++i ) {
	            let metaWindow = this.windows[i];
	            let box = new St.Bin({visible: true, 
        						reactive: true, can_focus: true, track_hover: true});
	            box.window = this.windows[i];
	            box.window.connect("notify::title", this._updateTitle.bind(this));
	            box.tooltip = box.window.get_title();
	            box.app = this.tracker.get_window_app(box.window);
                box.connect('button-press-event', () => {
                							this._activateWindow(metaWorkspace, metaWindow); } );
				box.icon = box.app.create_icon_texture(this.settings.get_int("icon-size"));
				if (this.settings.get_boolean("desaturated-icons")) {
					let iconEffect = new Clutter.DesaturateEffect();
					box.icon.add_effect(iconEffect);
				}
                if (metaWindow.is_hidden()) {
					box.icon.set_opacity(this.settings.get_int("hidden-opacity")); box.style_class = 'hidden-app';
                }
                else {
                	 if (metaWindow.has_focus()) {box.style_class = 'focused-app';}
                	 else {box.style_class = 'unfocused-app';}
                };
               	box.set_child(box.icon);
               	box.connect('notify::hover', () => {
                							this._onHover(box, box.tooltip); } );
                this.apps_menu.add_actor(box);
            };
        };
    }

	// windows list sort function by window id
    _sortWindows(w1, w2) {
    	return w1.get_id() - w2.get_id();
    }
    
	// NOT WORKING: displays the focused window title
    _updateTitle() {
    	if (global.display.get_focus_window()) {
			if (this.settings.get_boolean("show-window-titles")) {
				this.window_label = global.display.get_focus_window().get_title();
			} else {
				// only show app name
				if (this.tracker && this.tracker.get_window_app(global.display.get_focus_window())) { // in case there is no window app, e.g. gnome extension: Drop-Down-Terminal or reenabling extension
					this.window_label = this.tracker.get_window_app(global.display.get_focus_window()).get_name();
				}
			}
			// if (this.window_label) {
			// 	AppMenu._label.set_text(this.window_label);
			// }
    	};
    }
    
    // NOT WORKING: hover on app icon button b shows its window title tt
    _onHover(b, tt) {
    	// if (tt && b.hover) {
    	// 	AppMenu._label.set_text(tt);
    	// } else {
    	// 	this._updateTitle();
    	// };
    }
    
    // activate workspace ws
    _activateWorkspace(ws) {
		if (global.workspace_manager.get_active_workspace() === ws) {
			Main.overview.toggle();
		}
		else {
			Main.overview.show();
		};
		ws.activate(global.get_current_time());
    }

	// switch to workspace ws and activate window w
    _activateWindow(ws, w) {
        if (global.workspace_manager.get_active_workspace() === ws && w.has_focus() 
        												&& !(Main.overview.visible)) {
       		w.minimize();
       	}
        else {	
        	//w.unminimize();
			//w.unshade(global.get_current_time());
			w.activate(global.get_current_time());
		};
		Main.overview.hide();
		if (!(w.is_on_all_workspaces())) { ws.activate(global.get_current_time()); };
    }

	enable() {
		let gschema = Gio.SettingsSchemaSource.new_from_directory(
			this.dir.get_child('schemas').get_path(),
			Gio.SettingsSchemaSource.get_default(),
			false
		);
		this.settings_schema = gschema.lookup('org.gnome.shell.extensions.simple-task-bar', true);
		this.settings = new Gio.Settings({
			settings_schema: this.settings_schema
		});

		// signals for settings change
		let keys = this.settings_schema.list_keys();
		this.signals_array = [];
		for (let i in keys) {
			let key = keys[i];
			if (key == "remove-activities") {
				this.signals_array[i] = this.settings.connect( "changed::" + key, this._set_Activities_visibility.bind(this) );
			} else if (key == "places-menu-icon") {
				this.signals_array[i] = this.settings.connect( "changed::" + key, this._set_Places_to_icon.bind(this) );
			} else {
				this.signals_array[i] = this.settings.connect( "changed::" + key, this._updateMenu.bind(this) );
			}
		}

		if (this.settings.get_boolean("remove-activities")) {
			this._set_Activities_visibility();
		};

		if (this.settings.get_boolean("places-menu-icon")) {
			this._set_Places_to_icon();
		};
	
		this.apps_menu = new St.BoxLayout({});
		this.actor = this.apps_menu;
        this._updateMenu();
		this._restacked = global.display.connect('restacked', () => this._updateMenu());
		this._window_change_monitor = global.display.connect('window-left-monitor', () => this._updateMenu());
		this._workspace_changed = global.workspace_manager.connect('active-workspace-changed', () => this._updateMenu());
		this._workspace_number_changed = global.workspace_manager.connect('notify::n-workspaces', () => this._updateMenu());

		let position = 1;
		if ('places-menu' in Main.panel.statusArea)
			position++;
		Main.panel._leftBox.insert_child_at_index(this.actor, position);

		// hide icon before the AppMenu label
		// AppMenu._iconBox.hide();
	}

	disable() {

		// restore default AppMenu label
		// AppMenu._iconBox.show();
		
		this._destroy();
		
	}

};