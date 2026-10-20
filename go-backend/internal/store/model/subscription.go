package model

const (
	// SubscriptionOwn used the owner's credentials; such rows are converted
	// to SubscriptionShare on startup.
	SubscriptionOwn = "own"
	// SubscriptionShare (every subscription now): own credentials, cut off when
	// disabled or expired.
	SubscriptionShare = "share"
)

// Subscription is one subscription link: which inbounds it draws from and
// how the node list is processed (see kernel.SubOptions). Flag columns
// default to 0: GORM replaces a zero value with the column default on
// create, so a default of 1 could never be saved as false.
type Subscription struct {
	ID    int64  `gorm:"primaryKey;autoIncrement"`
	Name  string `gorm:"type:varchar(100);not null"`
	Kind  string `gorm:"type:varchar(10);not null;default:'own'"`
	Token string `gorm:"type:varchar(64);not null;uniqueIndex"`
	// UUID / Password are the credentials of a share subscription.
	UUID     string `gorm:"column:uuid;type:varchar(36);not null;default:''"`
	Password string `gorm:"type:varchar(64);not null;default:''"`
	// SourceAll includes every enabled inbound (new ones too); otherwise
	// InboundIDs (comma separated) lists them.
	SourceAll  int    `gorm:"column:source_all;not null;default:0"`
	InboundIDs string `gorm:"column:inbound_ids;type:text;not null;default:''"`
	// SourceIDs (comma separated) adds every node of these remote sources,
	// including ones a later refresh brings.
	SourceIDs string `gorm:"column:source_ids;type:text;not null;default:''"`
	// Options is the JSON processing pipeline.
	Options string `gorm:"type:text;not null;default:''"`
	// ExpireTime is unix ms; 0 never expires.
	ExpireTime int64 `gorm:"column:expire_time;not null;default:0"`
	Enabled    int   `gorm:"not null;default:0"`
	// AppliedActive is the active state last pushed to the kernels, so the
	// expiry loop knows whose credentials still have to be removed.
	AppliedActive int `gorm:"column:applied_active;not null;default:0"`
	// Traffic of a share subscription, counted on the nodes per user.
	// TrafficLimit (bytes, 0 = unlimited) cuts it off once reached;
	// ResetDay (1-28, 0 = never) zeroes the traffic monthly.
	UploadBytes      int64  `gorm:"column:upload_bytes;not null;default:0"`
	DownloadBytes    int64  `gorm:"column:download_bytes;not null;default:0"`
	TrafficLimit     int64  `gorm:"column:traffic_limit;not null;default:0"`
	ResetDay         int    `gorm:"column:reset_day;not null;default:0"`
	TrafficResetTime int64  `gorm:"column:traffic_reset_time;not null;default:0"`
	Remark           string `gorm:"type:text;not null;default:''"`
	// UserID is the panel user the subscription is assigned to (0 = none):
	// they see it under 订阅 in their panel and may reset its link.
	UserID      int64 `gorm:"column:user_id;not null;default:0;index"`
	Inx         int   `gorm:"not null;default:0"`
	CreatedTime int64 `gorm:"column:created_time;not null"`
	UpdatedTime int64 `gorm:"column:updated_time;not null"`
}

func (Subscription) TableName() string { return "subscription" }

// SubscriptionCounter remembers the last cumulative per-user counter seen
// from a node, so the next sample adds only the difference.
type SubscriptionCounter struct {
	ID             int64  `gorm:"primaryKey;autoIncrement"`
	NodeID         int64  `gorm:"column:node_id;not null;uniqueIndex:idx_sub_counter"`
	SubscriptionID int64  `gorm:"column:subscription_id;not null;uniqueIndex:idx_sub_counter"`
	Direction      string `gorm:"type:varchar(8);not null;uniqueIndex:idx_sub_counter"`
	Epoch          string `gorm:"type:varchar(32);not null;default:''"`
	Bytes          int64  `gorm:"not null;default:0"`
	UpdatedTime    int64  `gorm:"column:updated_time;not null;default:0"`
}

func (SubscriptionCounter) TableName() string { return "subscription_counter" }

// SubscriptionTemplate is a user's own Mihomo / sing-box / Surge profile that
// subscriptions render their nodes into (kernel/sub_template.go).
type SubscriptionTemplate struct {
	ID   int64  `gorm:"primaryKey;autoIncrement"`
	Name string `gorm:"type:varchar(100);not null"`
	// Kind is kernel.TemplateClash, TemplateSingbox or TemplateSurge.
	Kind    string `gorm:"type:varchar(20);not null"`
	Content string `gorm:"type:text;not null;default:''"`
	// SourceURL: the content is downloaded from here once a day; empty for
	// pasted templates.
	SourceURL   string `gorm:"column:source_url;type:text;not null;default:''"`
	LastFetch   int64  `gorm:"column:last_fetch;not null;default:0"`
	LastError   string `gorm:"column:last_error;type:text;not null;default:''"`
	CreatedTime int64  `gorm:"column:created_time;not null"`
	UpdatedTime int64  `gorm:"column:updated_time;not null"`
}

func (SubscriptionTemplate) TableName() string { return "subscription_template" }
